package com.wugui.datax.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.wugui.datax.admin.entity.JobApiTask;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 接口数据采集任务持久层接口
 *
 * @author ypc
 */
@Mapper
public interface JobApiTaskMapper extends BaseMapper<JobApiTask> {

    /**
     * 分页查询接口数据采集任务（带目标数据源名称）
     *
     * @param page 分页参数
     * @param taskName 任务名称模糊检索
     * @param status 状态
     * @return 接口任务分页记录
     */
    IPage<JobApiTask> selectApiTaskPage(Page<JobApiTask> page,
                                        @Param("taskName") String taskName,
                                        @Param("status") Integer status);
}
