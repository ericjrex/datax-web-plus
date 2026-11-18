package com.wugui.datax.admin.tool.stat;

import com.wugui.datax.admin.dto.StatTaskResultDto;
import com.wugui.datax.admin.entity.JobStatTask;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.Statement;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.locks.ReentrantLock;

/**
 * 统计计算任务并发控制与阻塞策略执行管理器
 * 统一提供 DISCARD_LATER (丢弃后续)、SERIAL_EXECUTION (单机串行)、COVER_EARLY (覆盖强杀)、CONCURRENT (允许并行) 的运行时管控
 *
 * @author ypc
 */
public class StatTaskExecutionManager {

    private static final Logger logger = LoggerFactory.getLogger(StatTaskExecutionManager.class);

    /**
     * 当前正在运行的任务上下文映射: taskId -> TaskRunningContext
     */
    private static final ConcurrentMap<Long, TaskRunningContext> RUNNING_TASKS = new ConcurrentHashMap<>();

    /**
     * 单机串行排队锁映射: taskId -> ReentrantLock
     */
    private static final ConcurrentMap<Long, ReentrantLock> TASK_LOCKS = new ConcurrentHashMap<>();

    /**
     * 线程私有上下文，便于计算引擎（如 Python / SQL）内部感知当前任务并挂载 Process / Statement 句柄
     */
    private static final ThreadLocal<TaskRunningContext> CURRENT_CONTEXT = new ThreadLocal<>();

    @FunctionalInterface
    public interface TaskAction {
        StatTaskResultDto run() throws Exception;
    }

    /**
     * 任务运行态上下文实体
     */
    public static class TaskRunningContext {
        private final Long taskId;
        private final long startTime;
        private final Thread workerThread;
        private final String triggerSource;
        private final AtomicReference<Process> activeProcess = new AtomicReference<>();
        private final AtomicReference<Statement> activeStatement = new AtomicReference<>();
        private volatile boolean cancelled = false;
        private volatile String cancelReason;
        private volatile Long logId;

        public TaskRunningContext(Long taskId, Thread workerThread, String triggerSource) {
            this.taskId = taskId;
            this.startTime = System.currentTimeMillis();
            this.workerThread = workerThread;
            this.triggerSource = triggerSource;
        }

        public Long getLogId() {
            return logId;
        }

        public void setLogId(Long logId) {
            this.logId = logId;
        }

        public Long getTaskId() {
            return taskId;
        }

        public long getStartTime() {
            return startTime;
        }

        public Thread getWorkerThread() {
            return workerThread;
        }

        public String getTriggerSource() {
            return triggerSource;
        }

        public AtomicReference<Process> getActiveProcess() {
            return activeProcess;
        }

        public AtomicReference<Statement> getActiveStatement() {
            return activeStatement;
        }

        public boolean isCancelled() {
            return cancelled;
        }

        public String getCancelReason() {
            return cancelReason;
        }

        /**
         * 强制终止当前正在运行的任务 (强杀 Python 子进程 / 取消 SQL Statement / 中断线程)
         *
         * @param reason 终止原因
         */
        public void cancel(String reason) {
            this.cancelled = true;
            this.cancelReason = reason;

            // 1. 强杀活跃的操作系统子进程 (Python)
            Process process = activeProcess.get();
            if (process != null && process.isAlive()) {
                try {
                    logger.info("强制终止任务 [{}] 关联的 Python 操作系统子进程", taskId);
                    process.destroyForcibly();
                } catch (Exception e) {
                    logger.warn("终止 Python 子进程异常: {}", e.getMessage());
                }
            }

            // 2. 取消执行中的数据库 JDBC Statement
            Statement stmt = activeStatement.get();
            if (stmt != null) {
                try {
                    logger.info("取消任务 [{}] 关联的数据库 SQL Statement 查询", taskId);
                    stmt.cancel();
                } catch (Exception e) {
                    logger.warn("取消 JDBC Statement 异常: {}", e.getMessage());
                }
            }

            // 3. 中断工作线程标记
            if (workerThread != null && workerThread.isAlive() && !Thread.currentThread().equals(workerThread)) {
                try {
                    workerThread.interrupt();
                } catch (Exception ignored) {
                }
            }
        }
    }

    /**
     * 判断指定任务当前是否正处于运行计算中
     *
     * @param taskId 统计任务ID
     * @return true-运行中，false-空闲
     */
    public static boolean isRunning(Long taskId) {
        return taskId != null && RUNNING_TASKS.containsKey(taskId);
    }

    /**
     * 获取指定任务的运行中上下文
     *
     * @param taskId 统计任务ID
     * @return 运行态上下文，未运行则返回 null
     */
    public static TaskRunningContext getRunningContext(Long taskId) {
        return taskId != null ? RUNNING_TASKS.get(taskId) : null;
    }

    /**
     * 引擎层绑定当前执行中的 Python Process 句柄
     *
     * @param process 启动的子进程对象
     */
    public static void registerActiveProcess(Process process) {
        TaskRunningContext ctx = CURRENT_CONTEXT.get();
        if (ctx != null && process != null) {
            ctx.getActiveProcess().set(process);
        }
    }

    /**
     * 引擎层注销绑定的 Python Process 句柄
     */
    public static void unregisterActiveProcess() {
        TaskRunningContext ctx = CURRENT_CONTEXT.get();
        if (ctx != null) {
            ctx.getActiveProcess().set(null);
        }
    }

    /**
     * 引擎层绑定当前执行中的 JDBC Statement 句柄
     *
     * @param stmt Statement 实例
     */
    public static void registerActiveStatement(Statement stmt) {
        TaskRunningContext ctx = CURRENT_CONTEXT.get();
        if (ctx != null && stmt != null) {
            ctx.getActiveStatement().set(stmt);
        }
    }

    /**
     * 引擎层注销绑定的 JDBC Statement 句柄
     */
    public static void unregisterActiveStatement() {
        TaskRunningContext ctx = CURRENT_CONTEXT.get();
        if (ctx != null) {
            ctx.getActiveStatement().set(null);
        }
    }

    /**
     * 获取当前工作线程所绑定的调度流水日志ID (用于流式物理日志落盘)
     *
     * @return 当前绑定的 logId，未绑定则返回 null
     */
    public static Long getCurrentLogId() {
        TaskRunningContext ctx = CURRENT_CONTEXT.get();
        return ctx != null ? ctx.getLogId() : null;
    }

    /**
     * 为当前工作线程绑定调度流水日志ID
     *
     * @param logId 调度流水日志主键ID
     */
    public static void setCurrentLogId(Long logId) {
        TaskRunningContext ctx = CURRENT_CONTEXT.get();
        if (ctx != null) {
            ctx.setLogId(logId);
        }
    }

    /**
     * 核心入口: 根据任务配置的阻塞策略环绕执行任务 (支持传入唯一的调度流水日志ID)
     *
     * @param task 统计任务实体
     * @param triggerSource 触发方式 ("CRON" 或 "MANUAL")
     * @param logId 本次执行对应的调度流水主键ID (可为 null)
     * @param action 具体执行逻辑回调
     * @return 执行结果 DTO
     * @throws Exception 执行异常
     */
    public static StatTaskResultDto executeWithStrategy(JobStatTask task, String triggerSource, Long logId, TaskAction action) throws Exception {
        TaskAction wrappedAction = () -> {
            if (logId != null) {
                setCurrentLogId(logId);
            }
            return action.run();
        };
        return executeWithStrategy(task, triggerSource, wrappedAction);
    }

    /**
     * 核心入口: 根据任务配置的阻塞策略环绕执行任务
     *
     * @param task 统计任务实体
     * @param triggerSource 触发方式 ("CRON" 或 "MANUAL")
     * @param action 具体执行逻辑回调
     * @return 执行结果 DTO
     * @throws Exception 执行异常
     */
    public static StatTaskResultDto executeWithStrategy(JobStatTask task, String triggerSource, TaskAction action) throws Exception {
        if (task == null || task.getId() == null) {
            throw new IllegalArgumentException("执行任务及任务ID不能为空");
        }

        Long taskId = task.getId();
        String strategy = StringUtils.defaultIfBlank(task.getExecutorBlockStrategy(), "DISCARD_LATER").trim().toUpperCase();

        logger.info("开始调度执行统计任务 [ID: {}, 名称: {}], 配置阻塞策略: {}, 触发来源: {}",
                taskId, task.getTaskName(), strategy, triggerSource);

        switch (strategy) {
            case "DISCARD_LATER":
                return handleDiscardLater(task, triggerSource, action);

            case "SERIAL_EXECUTION":
                return handleSerialExecution(task, triggerSource, action);

            case "COVER_EARLY":
                return handleCoverEarly(task, triggerSource, action);

            case "CONCURRENT":
                return handleConcurrent(task, triggerSource, action);

            default:
                logger.warn("未识别的阻塞策略 [{}], 默认回退使用 DISCARD_LATER (丢弃后续调度)", strategy);
                return handleDiscardLater(task, triggerSource, action);
        }
    }

    /**
     * 策略 1: DISCARD_LATER 丢弃后续调度 (防并发堆叠)
     */
    private static StatTaskResultDto handleDiscardLater(JobStatTask task, String triggerSource, TaskAction action) throws Exception {
        Long taskId = task.getId();
        TaskRunningContext newCtx = new TaskRunningContext(taskId, Thread.currentThread(), triggerSource);

        // 原子抢占运行槽位
        TaskRunningContext existing = RUNNING_TASKS.putIfAbsent(taskId, newCtx);
        if (existing != null) {
            long runningSec = (System.currentTimeMillis() - existing.getStartTime()) / 1000;
            String discardMsg = String.format("【阻塞策略生效: 丢弃后续调度】该统计任务上一轮执行尚未结束(已运行 %d 秒，触发来源: %s)，本次调度已安全丢弃，防止并发堆叠与写冲突。",
                    runningSec, existing.getTriggerSource());
            logger.warn("任务 [ID: {}, 名称: {}] 触发阻塞策略: {}", taskId, task.getTaskName(), discardMsg);

            StatTaskResultDto discardResult = new StatTaskResultDto();
            discardResult.setSuccess(false);
            discardResult.setMessage(discardMsg);
            discardResult.setCostMs(0L);
            discardResult.setWrittenRows(0L);
            return discardResult;
        }

        CURRENT_CONTEXT.set(newCtx);
        try {
            return action.run();
        } finally {
            RUNNING_TASKS.remove(taskId);
            CURRENT_CONTEXT.remove();
        }
    }

    /**
     * 策略 2: SERIAL_EXECUTION 单机串行 (排队等待上一轮完成)
     */
    private static StatTaskResultDto handleSerialExecution(JobStatTask task, String triggerSource, TaskAction action) throws Exception {
        Long taskId = task.getId();
        ReentrantLock lock = TASK_LOCKS.computeIfAbsent(taskId, k -> new ReentrantLock(true));

        int timeout = (task.getTimeoutSeconds() != null && task.getTimeoutSeconds() > 0) ? task.getTimeoutSeconds() : 3600;
        logger.info("任务 [ID: {}] 尝试获取单机串行执行锁，最大排队等待超时: {} 秒", taskId, timeout);

        boolean acquired = lock.tryLock(timeout, TimeUnit.SECONDS);
        if (!acquired) {
            String timeoutMsg = String.format("【阻塞策略生效: 单机串行超时】等待上一轮任务释放执行锁超过最大限制(%d 秒)，本次调度已终止", timeout);
            logger.error("任务 [ID: {}] 获取串行执行锁超时", taskId);
            throw new TimeoutException(timeoutMsg);
        }

        TaskRunningContext newCtx = new TaskRunningContext(taskId, Thread.currentThread(), triggerSource);
        RUNNING_TASKS.put(taskId, newCtx);
        CURRENT_CONTEXT.set(newCtx);

        try {
            return action.run();
        } finally {
            RUNNING_TASKS.remove(taskId);
            CURRENT_CONTEXT.remove();
            lock.unlock();
        }
    }

    /**
     * 策略 3: COVER_EARLY 覆盖之前调度 (强杀上一轮正在运行的任务)
     */
    private static StatTaskResultDto handleCoverEarly(JobStatTask task, String triggerSource, TaskAction action) throws Exception {
        Long taskId = task.getId();
        TaskRunningContext existing = RUNNING_TASKS.get(taskId);

        if (existing != null) {
            long runningSec = (System.currentTimeMillis() - existing.getStartTime()) / 1000;
            logger.warn("任务 [ID: {}] 触发阻塞策略: 覆盖之前调度，强制终止上一轮执行中的任务(已运行 {} 秒，来源: {})",
                    taskId, runningSec, existing.getTriggerSource());

            existing.cancel("被新一轮调度覆盖强杀终止");

            // 等待上一轮退出并释放资源，最多安全等待 3 秒
            long waitStart = System.currentTimeMillis();
            while (RUNNING_TASKS.containsKey(taskId) && (System.currentTimeMillis() - waitStart < 3000)) {
                try {
                    Thread.sleep(100);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
            RUNNING_TASKS.remove(taskId);
        }

        TaskRunningContext newCtx = new TaskRunningContext(taskId, Thread.currentThread(), triggerSource);
        RUNNING_TASKS.put(taskId, newCtx);
        CURRENT_CONTEXT.set(newCtx);

        try {
            return action.run();
        } finally {
            RUNNING_TASKS.remove(taskId);
            CURRENT_CONTEXT.remove();
        }
    }

    /**
     * 策略 4: CONCURRENT 允许并行 (保持旧有模式，不加锁，但登记运行态供监控)
     */
    private static StatTaskResultDto handleConcurrent(JobStatTask task, String triggerSource, TaskAction action) throws Exception {
        Long taskId = task.getId();
        TaskRunningContext newCtx = new TaskRunningContext(taskId, Thread.currentThread(), triggerSource);
        RUNNING_TASKS.put(taskId, newCtx);
        CURRENT_CONTEXT.set(newCtx);

        try {
            return action.run();
        } finally {
            RUNNING_TASKS.remove(taskId);
            CURRENT_CONTEXT.remove();
        }
    }
}
