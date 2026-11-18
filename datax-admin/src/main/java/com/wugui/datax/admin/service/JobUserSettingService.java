package com.wugui.datax.admin.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.wugui.datax.admin.entity.JobUserSetting;

/**
 * 用户个性化偏好设置服务接口
 *
 * @author ypc
 */
public interface JobUserSettingService extends IService<JobUserSetting> {

    /**
     * 获取指定用户的配置值
     *
     * @param userId 用户ID
     * @param settingKey 配置键名
     * @return 配置值 (字符串)，无配置时返回 null
     */
    String getSettingValue(Integer userId, String settingKey);

    /**
     * 保存或更新用户个性化配置
     *
     * @param userId 用户ID
     * @param username 用户名
     * @param settingKey 配置键名
     * @param settingValue 配置值
     * @return 操作是否成功
     */
    boolean saveSetting(Integer userId, String username, String settingKey, String settingValue);
}
