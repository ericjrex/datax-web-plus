package com.wugui.datax.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.wugui.datax.admin.entity.JobUserSetting;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.springframework.stereotype.Repository;

/**
 * 用户个性化偏好设置持久层 Mapper 接口
 *
 * @author ypc
 */
@Mapper
@Repository
public interface JobUserSettingMapper extends BaseMapper<JobUserSetting> {

    /**
     * 根据用户ID和配置键名查询配置
     *
     * @param userId 用户ID
     * @param settingKey 配置键名
     * @return 用户设置实体
     */
    JobUserSetting getByUserIdAndKey(@Param("userId") Integer userId, @Param("settingKey") String settingKey);

    /**
     * 原子保存或更新用户配置 (基于 MySQL ON DUPLICATE KEY UPDATE)
     *
     * @param setting 用户配置实体
     * @return 影响行数
     */
    int saveOrUpdateSetting(JobUserSetting setting);
}
