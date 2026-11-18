package com.wugui.datax.admin.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.wugui.datax.admin.entity.JobUserSetting;
import com.wugui.datax.admin.mapper.JobUserSettingMapper;
import com.wugui.datax.admin.service.JobUserSettingService;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;

/**
 * 用户个性化偏好设置服务实现类
 *
 * @author ypc
 */
@Service
public class JobUserSettingServiceImpl extends ServiceImpl<JobUserSettingMapper, JobUserSetting> implements JobUserSettingService {

    @Resource
    private JobUserSettingMapper jobUserSettingMapper;

    @Override
    public String getSettingValue(Integer userId, String settingKey) {
        if (userId == null || settingKey == null || settingKey.trim().isEmpty()) {
            return null;
        }
        JobUserSetting setting = jobUserSettingMapper.getByUserIdAndKey(userId, settingKey.trim());
        return setting != null ? setting.getSettingValue() : null;
    }

    @Override
    public boolean saveSetting(Integer userId, String username, String settingKey, String settingValue) {
        if (userId == null || settingKey == null || settingKey.trim().isEmpty()) {
            return false;
        }
        JobUserSetting setting = new JobUserSetting();
        setting.setUserId(userId);
        setting.setUsername(username != null ? username.trim() : "");
        setting.setSettingKey(settingKey.trim());
        setting.setSettingValue(settingValue);
        return jobUserSettingMapper.saveOrUpdateSetting(setting) > 0;
    }
}
