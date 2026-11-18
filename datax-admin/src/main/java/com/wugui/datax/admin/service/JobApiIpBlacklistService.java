package com.wugui.datax.admin.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.wugui.datax.admin.entity.JobApiIpBlacklist;

import javax.servlet.http.HttpServletRequest;
import java.util.List;

/**
 * 开放 API 客户端 IP 黑名单管控服务接口
 *
 * @author ypc
 * @since 2026-11-03
 */
public interface JobApiIpBlacklistService extends IService<JobApiIpBlacklist> {

    /**
     * 立即刷新 JVM 内存中的生效黑名单快照缓存
     */
    void refreshCache();

    /**
     * 获取当前内存中所有生效中的黑名单列表快照
     *
     * @return 生效中的黑名单列表 (status = 1)
     */
    List<JobApiIpBlacklist> getActiveBlacklistSnapshot();

    /**
     * 匹配指定客户端 IP 与 AppKey 是否命中生效中的黑名单规则
     * 遵循黑名单优先原则：既匹配全局封禁 (appKey = '*')，也匹配当前指定 appKey 的规则；
     * 支持精确 IP、星号通配符 (如 192.168.1.*) 与 IPv4 CIDR 网段 (如 10.0.0.0/24)。
     *
     * @param clientIp 客户端真实 IP
     * @param appKey   当前请求的 AccessKey (可为空)
     * @return 若命中黑名单则返回对应的黑名单规则实体，未命中返回 null
     */
    JobApiIpBlacklist matchActiveBlacklist(String clientIp, String appKey);

    /**
     * 新增或更新单条 IP 黑名单记录（具备幂等去重能力，若已存在相同 ipAddress + appKey 则自动激活并更新原因）
     *
     * @param ipAddress   待封禁 IP
     * @param appKey      作用范围 (* 或具体 appKey)
     * @param reason      封禁原因备注
     * @param sourceLogId 关联审计日志 ID (可选)
     * @param operator    操作管理员用户名
     * @return 保存后的黑名单实体
     */
    JobApiIpBlacklist addOrUpdateBlacklist(String ipAddress, String appKey, String reason, Long sourceLogId, String operator);

    /**
     * 根据客户端 IP 一键解封（将该 IP 下所有生效中的全局或指定账号黑名单状态置为 0）
     *
     * @param ipAddress 客户端 IP
     * @param appKey    可选，若传具体 appKey 则同时解封该 IP 的全局与该 appKey 规则；若为空或 * 则解封该 IP 的全部生效规则
     * @return 解封影响的记录条数
     */
    int unblockByIp(String ipAddress, String appKey);

    /**
     * 判断目标 IP 是否为本机回环地址 (127.0.0.1 / localhost / ::1)
     *
     * @param ip IP 地址字符串
     * @return true 表示回环地址
     */
    boolean isLoopbackIp(String ip);

    /**
     * 公共辅助方法：从 HttpServletRequest 提取客户端真实 IP
     *
     * @param request HTTP 请求对象
     * @return 规范化后的客户端真实 IP
     */
    String extractClientIp(HttpServletRequest request);
}
