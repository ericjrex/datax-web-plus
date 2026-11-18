package com.wugui.datax.admin.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.wugui.datax.admin.entity.JobApiAccount;

/**
 * 外部 API 接口账号及权限服务接口
 *
 * @author ypc
 * @since 2026-10-28
 */
public interface JobApiAccountService extends IService<JobApiAccount> {

    /**
     * 根据 AppKey 获取有效启用的账号信息
     *
     * @param appKey AccessKey
     * @return 账号实体，若不存在或停用返回 null
     */
    JobApiAccount getActiveAccount(String appKey);

    /**
     * 创建或保存 API 账号（自动生成 AppKey 与 AppSecret）
     *
     * @param account 账号配置实体
     * @return 保存成功后的账号实体
     */
    JobApiAccount createAccount(JobApiAccount account);

    /**
     * 重置指定账号的 AppSecret
     *
     * @param id 账号主键ID
     * @return 新生成的 AppSecret
     */
    String resetSecret(Integer id);
}
