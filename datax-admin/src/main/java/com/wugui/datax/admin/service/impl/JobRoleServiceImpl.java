package com.wugui.datax.admin.service.impl;

import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.wugui.datax.admin.entity.JobRole;
import com.wugui.datax.admin.entity.JobRoleMenuPermission;
import com.wugui.datax.admin.entity.JobRoleTablePermission;
import com.wugui.datax.admin.mapper.JobRoleMapper;
import com.wugui.datax.admin.mapper.JobRoleMenuPermissionMapper;
import com.wugui.datax.admin.mapper.JobRoleTablePermissionMapper;
import com.wugui.datax.admin.mapper.JobUserMapper;
import com.wugui.datax.admin.service.JobRoleService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.annotation.Resource;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.regex.Pattern;

/**
 * 系统角色元数据字典服务实现类
 *
 * @author ypc
 * @since 2026-10-23
 */
@Service
public class JobRoleServiceImpl extends ServiceImpl<JobRoleMapper, JobRole> implements JobRoleService {

    /**
     * 角色编码正则表达式：大写字母开头，由大写字母、数字及下划线组成，长度3到30位
     */
    private static final Pattern ROLE_CODE_PATTERN = Pattern.compile("^[A-Z][A-Z0-9_]{2,30}$");

    @Resource
    private JobRoleMapper jobRoleMapper;

    @Resource
    private JobRoleTablePermissionMapper jobRoleTablePermissionMapper;

    @Resource
    private JobRoleMenuPermissionMapper jobRoleMenuPermissionMapper;

    @Resource
    private JobUserMapper jobUserMapper;

    @Override
    public List<JobRole> listAllRoles() {
        List<JobRole> list = jobRoleMapper.listAllRoles();
        if (list == null || list.isEmpty()) {
            // 兜底机制：若数据库尚未同步执行初始化脚本，返回内存内置角色保证前端不报错
            list = buildDefaultRolesFallback();
        }
        return list;
    }

    @Override
    public String addRole(JobRole jobRole) {
        if (jobRole == null) {
            return "参数错误: 角色对象不能为空";
        }

        String roleCode = StrUtil.trim(jobRole.getRoleCode());
        String roleName = StrUtil.trim(jobRole.getRoleName());

        if (StrUtil.isBlank(roleCode)) {
            return "角色编码不能为空";
        }

        // 统一规范转为大写
        roleCode = roleCode.toUpperCase();
        if (!ROLE_CODE_PATTERN.matcher(roleCode).matches()) {
            return "角色编码格式错误: 须以大写字母开头，仅允许大写字母、数字和下划线，长度3-30位 (例如: ROLE_ANALYST)";
        }

        if (StrUtil.isBlank(roleName)) {
            return "角色中文名称不能为空";
        }
        if (roleName.length() > 30) {
            return "角色中文名称长度不能超过30个字符";
        }

        // 查重校验
        JobRole exist = jobRoleMapper.getByRoleCode(roleCode);
        if (exist != null) {
            return "角色编码 [" + roleCode + "] 已存在，请勿重复创建";
        }

        jobRole.setRoleCode(roleCode);
        jobRole.setRoleName(roleName);
        jobRole.setDescription(StrUtil.trim(jobRole.getDescription()));
        jobRole.setIsSystem(0); // 自定义角色非系统内置
        if (jobRole.getSortOrder() == null || jobRole.getSortOrder() <= 0) {
            jobRole.setSortOrder(100);
        }
        Date now = new Date();
        jobRole.setCreateTime(now);
        jobRole.setUpdateTime(now);

        boolean ok = this.save(jobRole);
        return ok ? null : "保存角色记录失败";
    }

    @Override
    public JobRole getByRoleCode(String roleCode) {
        if (StrUtil.isBlank(roleCode)) {
            return null;
        }
        return jobRoleMapper.getByRoleCode(roleCode.trim());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public String deleteRole(String roleCode) {
        if (StrUtil.isBlank(roleCode)) {
            return "参数错误: 角色编码不能为空";
        }
        roleCode = roleCode.trim();
        String upper = roleCode.toUpperCase();
        if ("ROLE_ADMIN".equals(upper) || "ROLE_USER".equals(upper)) {
            return "系统内置基础角色 (" + roleCode + ") 禁止删除";
        }

        // 1. 级联清理该角色的所有库表访问权限规则 (job_role_table_permission)
        jobRoleTablePermissionMapper.delete(new LambdaQueryWrapper<JobRoleTablePermission>()
                .eq(JobRoleTablePermission::getRoleCode, roleCode));

        // 2. 级联清理该角色的系统菜单访问策略 (job_role_menu_permission)
        jobRoleMenuPermissionMapper.delete(new LambdaQueryWrapper<JobRoleMenuPermission>()
                .eq(JobRoleMenuPermission::getRoleCode, roleCode));

        // 3. 物理删除角色字典表中的元数据记录 (job_role)
        jobRoleMapper.delete(new LambdaQueryWrapper<JobRole>()
                .eq(JobRole::getRoleCode, roleCode));

        // 4. 重置该角色下的所有关联用户为默认普通用户 (ROLE_USER)，消除孤儿引用
        jobUserMapper.resetUserRoleByRole(roleCode, "ROLE_USER");

        return null;
    }

    /**
     * 构建系统内置默认角色的高可用兜底列表
     */
    private List<JobRole> buildDefaultRolesFallback() {
        List<JobRole> fallbackList = new ArrayList<>();

        JobRole adminRole = new JobRole();
        adminRole.setId(1);
        adminRole.setRoleCode("ROLE_ADMIN");
        adminRole.setRoleName("系统管理员");
        adminRole.setDescription("拥有平台所有库表、菜单及数据同步任务最高特权");
        adminRole.setIsSystem(1);
        adminRole.setSortOrder(1);
        fallbackList.add(adminRole);

        JobRole userRole = new JobRole();
        userRole.setId(2);
        userRole.setRoleCode("ROLE_USER");
        userRole.setRoleName("普通用户");
        userRole.setDescription("受库表权限与菜单权限白名单管控的普通操作员");
        userRole.setIsSystem(1);
        userRole.setSortOrder(2);
        fallbackList.add(userRole);

        return fallbackList;
    }
}
