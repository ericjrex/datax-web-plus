package com.wugui.datax.admin.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.wugui.datax.admin.entity.JobRoleMenuPermission;
import com.wugui.datax.admin.mapper.JobRoleMenuPermissionMapper;
import com.wugui.datax.admin.service.RoleMenuPermissionService;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.List;

/**
 * 角色系统菜单访问权限服务实现类
 *
 * @author ypc
 * @since 2026-09-11
 */
@Service
public class RoleMenuPermissionServiceImpl extends ServiceImpl<JobRoleMenuPermissionMapper, JobRoleMenuPermission>
        implements RoleMenuPermissionService {

    /**
     * 超级管理员通配符
     */
    private static final String WILDCARD_ALL = "*";

    /**
     * 未授权或无策略配置时的安全降级白名单菜单列表
     * 排除高危管理项：user (用户管理), jdbcDatasource (数据源管理)
     */
    private static final List<String> DEFAULT_SAFE_MENUS = Collections.unmodifiableList(
            Arrays.asList("dashboard", "project", "jobInfo", "jobLog", "tableQuery")
    );

    @Autowired
    private JobRoleMenuPermissionMapper jobRoleMenuPermissionMapper;

    @Override
    public List<String> getRoleAllowedMenuCodes(String roleCode) {
        if (isAdmin(roleCode)) {
            return Collections.singletonList(WILDCARD_ALL);
        }

        if (StringUtils.isBlank(roleCode)) {
            return new ArrayList<>(DEFAULT_SAFE_MENUS);
        }

        JobRoleMenuPermission perm = jobRoleMenuPermissionMapper.getByRoleCode(roleCode.trim());
        if (perm == null || StringUtils.isBlank(perm.getMenuCodes())) {
            return new ArrayList<>(DEFAULT_SAFE_MENUS);
        }

        String codes = perm.getMenuCodes().trim();
        if (WILDCARD_ALL.equals(codes)) {
            return Collections.singletonList(WILDCARD_ALL);
        }

        List<String> list = new ArrayList<>();
        for (String item : codes.split(",")) {
            String trimmed = item.trim();
            if (StringUtils.isNotBlank(trimmed)) {
                list.add(trimmed);
            }
        }
        return list;
    }

    @Override
    public boolean saveOrUpdateRoleMenuPermission(JobRoleMenuPermission permission) {
        if (permission == null || StringUtils.isBlank(permission.getRoleCode())) {
            return false;
        }

        String roleCode = permission.getRoleCode().trim();
        JobRoleMenuPermission exist = jobRoleMenuPermissionMapper.getByRoleCode(roleCode);

        Date now = new Date();
        permission.setUpdateTime(now);

        if (exist != null) {
            permission.setId(exist.getId());
            return jobRoleMenuPermissionMapper.updateById(permission) > 0;
        } else {
            permission.setCreateTime(now);
            return jobRoleMenuPermissionMapper.insert(permission) > 0;
        }
    }

    @Override
    public List<JobRoleMenuPermission> getAllRoleMenuPermissions() {
        return jobRoleMenuPermissionMapper.listAllRoleMenus();
    }

    /**
     * 判断角色标识是否属于超级管理员
     *
     * @param roleCode 角色标识
     * @return true-管理员
     */
    private boolean isAdmin(String roleCode) {
        if (StringUtils.isBlank(roleCode)) {
            return false;
        }
        return "ROLE_ADMIN".equalsIgnoreCase(roleCode.trim()) || "1".equals(roleCode.trim());
    }
}
