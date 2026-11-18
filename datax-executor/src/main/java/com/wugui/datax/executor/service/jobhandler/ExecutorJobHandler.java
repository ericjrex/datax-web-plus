package com.wugui.datax.executor.service.jobhandler;

import cn.hutool.core.io.FileUtil;
import cn.hutool.core.util.IdUtil;
import com.wugui.datatx.core.biz.model.HandleProcessCallbackParam;
import com.wugui.datatx.core.biz.model.ReturnT;
import com.wugui.datatx.core.biz.model.TriggerParam;
import com.wugui.datatx.core.handler.IJobHandler;
import com.wugui.datatx.core.handler.annotation.JobHandler;
import com.wugui.datatx.core.log.JobLogger;
import com.wugui.datatx.core.thread.ProcessCallbackThread;
import com.wugui.datatx.core.util.ProcessUtil;
import com.wugui.datax.executor.service.logparse.LogStatistics;
import com.wugui.datax.executor.util.SystemUtils;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.*;
import java.util.concurrent.FutureTask;

import static com.wugui.datax.executor.service.command.BuildCommand.buildDataXExecutorCmd;
import static com.wugui.datax.executor.service.jobhandler.DataXConstant.DEFAULT_JSON;
import static com.wugui.datax.executor.service.logparse.AnalysisStatistics.analysisStatisticsLog;

/**
 * DataX任务运行
 *
 * @author jingwk 2019-11-16
 */

@JobHandler(value = "executorJobHandler")
@Component
public class ExecutorJobHandler extends IJobHandler {

    @Value("${datax.executor.jsonpath}")
    private String jsonPath;

    @Value("${datax.pypath}")
    private String dataXPyPath;


    @Override
    public ReturnT<String> execute(TriggerParam trigger) {

        int exitValue = -1;
        Thread errThread = null;
        String tmpFilePath;
        LogStatistics logStatistics = null;
        //Generate JSON temporary file
        try {
            tmpFilePath = generateTemJsonFile(trigger.getJobJson());
        } catch (Exception e) {
            JobLogger.log("生成 DataX 临时配置文件失败：" + e.getMessage());
            return new ReturnT<>(IJobHandler.FAIL.getCode(), "生成 DataX 作业配置临时文件失败: " + e.getMessage());
        }

        try {
            String[] cmdarrayFinal = buildDataXExecutorCmd(trigger, tmpFilePath,dataXPyPath);
            final Process process = Runtime.getRuntime().exec(cmdarrayFinal);
            String prcsId = ProcessUtil.getProcessId(process);
            JobLogger.log("------------------DataX process id: " + prcsId);
            jobTmpFiles.put(prcsId, tmpFilePath);
            //update datax process id
            HandleProcessCallbackParam prcs = new HandleProcessCallbackParam(trigger.getLogId(), trigger.getLogDateTime(), prcsId);
            ProcessCallbackThread.pushCallBack(prcs);
            // log-thread
            Thread futureThread = null;
            FutureTask<LogStatistics> futureTask = new FutureTask<>(() -> analysisStatisticsLog(new BufferedInputStream(process.getInputStream())));
            futureThread = new Thread(futureTask);
            futureThread.start();

            errThread = new Thread(() -> {
                try {
                    analysisStatisticsLog(new BufferedInputStream(process.getErrorStream()));
                } catch (IOException e) {
                    JobLogger.log(e);
                }
            });

            logStatistics = futureTask.get();
            errThread.start();
            // process-wait
            exitValue = process.waitFor();      // exit code: 0=success, 1=error
            // log-thread join
            errThread.join();
        } catch (Exception e) {
            JobLogger.log(e);
        } finally {
            if (errThread != null && errThread.isAlive()) {
                errThread.interrupt();
            }
            //  删除临时文件
            if (FileUtil.exist(tmpFilePath)) {
                FileUtil.del(new File(tmpFilePath));
            }
        }
        if (exitValue == 0) {
            return new ReturnT<>(200, logStatistics.toString());
        } else {
            return new ReturnT<>(IJobHandler.FAIL.getCode(), "command exit value(" + exitValue + ") is failed");
        }
    }



    /**
     * 生成 DataX 作业配置临时文件并返回其标准绝对路径
     *
     * @param jobJson 作业 JSON 配置文本
     * @return 临时配置文件的绝对路径
     * @throws IOException 当文件写入或目录创建失败时抛出
     */
    private String generateTemJsonFile(String jobJson) throws IOException {
        if (StringUtils.isBlank(jobJson)) {
            throw new IllegalArgumentException("DataX 任务配置内容 (jobJson) 为空，无法生成临时配置文件！");
        }

        String dataXHomePath = SystemUtils.getDataXHomePath();
        String targetDir = StringUtils.isNotEmpty(dataXHomePath) ? (dataXHomePath + DEFAULT_JSON) : jsonPath;

        // 统一转换为标准绝对路径目录，确保父目录结构完整创建
        File dir = new File(targetDir).getAbsoluteFile();
        if (!dir.exists() && !dir.mkdirs()) {
            if (!dir.exists()) {
                throw new IOException("无法创建 DataX 临时配置文件存储目录: " + dir.getAbsolutePath());
            }
        }

        // 使用安全无歧义的文件对象拼接绝对路径
        File tmpFile = new File(dir, "jobTmp-" + IdUtil.simpleUUID() + ".conf");
        // 使用 Hutool 标准写出 UTF-8 文件内容
        FileUtil.writeUtf8String(jobJson, tmpFile);
        return tmpFile.getAbsolutePath();
    }

}
