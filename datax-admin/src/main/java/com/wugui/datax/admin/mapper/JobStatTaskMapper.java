package com.wugui.datax.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.wugui.datax.admin.entity.JobStatTask;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 统计计算任务持久层访问接口
 *
 * @author ypc
 */
@Mapper
public interface JobStatTaskMapper extends BaseMapper<JobStatTask> {

    /**
     * 分页查询统计任务列表并关联数据源名称
     *
     * @param page 分页参数
     * @param taskName 任务名称模糊搜索
     * @param taskType 任务类型
     * @param status 调度状态
     * @param datasourceId 数据源ID (源端或目标端)
     * @param tableName 目标表名模糊搜索
     * @return 分页结果
     */
    IPage<JobStatTask> selectStatTaskPage(Page<JobStatTask> page,
                                         @Param("taskName") String taskName,
                                         @Param("taskType") String taskType,
                                         @Param("status") Integer status,
                                         @Param("datasourceId") Long datasourceId,
                                         @Param("tableName") String tableName);
}
