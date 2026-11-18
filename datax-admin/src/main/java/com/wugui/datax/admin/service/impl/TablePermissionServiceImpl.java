package com.wugui.datax.admin.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.wugui.datax.admin.entity.JobRoleTablePermission;
import com.wugui.datax.admin.mapper.JobRoleTablePermissionMapper;
import com.wugui.datax.admin.service.TablePermissionService;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.List;

/**
 * 角色库表权限业务逻辑实现类
 *
 * @author ypc
 * @since 2026-09-11
 */
@Service
public class TablePermissionServiceImpl extends ServiceImpl<JobRoleTablePermissionMapper, JobRoleTablePermission>
        implements TablePermissionService {

    public static final String ROLE_ADMIN = "ROLE_ADMIN";
    public static final String ROLE_ADMIN_NUM = "1";
    public static final String WILDCARD_ALL = "*";
    public static final int DEFAULT_MAX_ROWS = 100;
    public static final int ADMIN_MAX_ROWS = 2000;

    @Resource
    private JobRoleTablePermissionMapper jobRoleTablePermissionMapper;

    /**
     * 判断角色是否为管理员 (ROLE_ADMIN 或 1)
     *
     * @param roleCode 角色编码
     * @return 是否为管理员
     */
    private boolean isAdmin(String roleCode) {
        if (StringUtils.isBlank(roleCode)) {
            return false;
        }
        return ROLE_ADMIN.equalsIgnoreCase(roleCode.trim()) || ROLE_ADMIN_NUM.equals(roleCode.trim());
    }

    @Override
    public boolean isTableAllowed(String roleCode, Long datasourceId, String tableName) {
        if (isAdmin(roleCode)) {
            return true;
        }
        if (datasourceId == null || StringUtils.isBlank(tableName)) {
            return false;
        }

        JobRoleTablePermission perm = jobRoleTablePermissionMapper.getByRoleAndDatasource(roleCode, datasourceId);
        if (perm == null || StringUtils.isBlank(perm.getTableNames())) {
            return false;
        }

        return matchTableName(perm.getTableNames(), tableName);
    }

    @Override
    public boolean isQueryAllowed(String roleCode, Long datasourceId, String tableName) {
        if (isAdmin(roleCode)) {
            return true;
        }
        if (!isTableAllowed(roleCode, datasourceId, tableName)) {
            return false;
        }
        JobRoleTablePermission perm = jobRoleTablePermissionMapper.getByRoleAndDatasource(roleCode, datasourceId);
        return perm != null && perm.getAllowQuery() != null && perm.getAllowQuery() == 1;
    }

    @Override
    public boolean isSqlAllowed(String roleCode, Long datasourceId) {
        if (isAdmin(roleCode)) {
            return true;
        }
        if (datasourceId == null) {
            return false;
        }
        JobRoleTablePermission perm = jobRoleTablePermissionMapper.getByRoleAndDatasource(roleCode, datasourceId);
        return perm != null && perm.getAllowSql() != null && perm.getAllowSql() == 1;
    }

    @Override
    public int getMaxQueryRows(String roleCode, Long datasourceId) {
        if (isAdmin(roleCode)) {
            return ADMIN_MAX_ROWS;
        }
        if (datasourceId == null) {
            return DEFAULT_MAX_ROWS;
        }
        JobRoleTablePermission perm = jobRoleTablePermissionMapper.getByRoleAndDatasource(roleCode, datasourceId);
        if (perm != null && perm.getMaxQueryRows() != null && perm.getMaxQueryRows() > 0) {
            return perm.getMaxQueryRows();
        }
        return DEFAULT_MAX_ROWS;
    }

    @Override
    public List<Long> getAllowedDatasourceIds(String roleCode) {
        if (isAdmin(roleCode)) {
            return null;
        }
        List<JobRoleTablePermission> list = jobRoleTablePermissionMapper.listByRoleCode(roleCode);
        List<Long> ids = new ArrayList<>();
        if (list != null) {
            for (JobRoleTablePermission p : list) {
                if (p.getDatasourceId() != null) {
                    ids.add(p.getDatasourceId());
                }
            }
        }
        return ids;
    }

    @Override
    public List<String> getAllowedTableNames(String roleCode, Long datasourceId) {
        if (isAdmin(roleCode)) {
            return Arrays.asList(WILDCARD_ALL);
        }
        JobRoleTablePermission perm = jobRoleTablePermissionMapper.getByRoleAndDatasource(roleCode, datasourceId);
        if (perm == null || StringUtils.isBlank(perm.getTableNames())) {
            return new ArrayList<>();
        }
        List<String> names = new ArrayList<>();
        for (String item : perm.getTableNames().split(",")) {
            String trimmed = item.trim();
            if (StringUtils.isNotBlank(trimmed)) {
                names.add(trimmed);
            }
        }
        return names;
    }

    @Override
    public boolean saveOrUpdateRolePermission(JobRoleTablePermission permission) {
        if (permission == null || StringUtils.isBlank(permission.getRoleCode()) || permission.getDatasourceId() == null) {
            return false;
        }

        JobRoleTablePermission exist = jobRoleTablePermissionMapper.getByRoleAndDatasource(
                permission.getRoleCode().trim(), permission.getDatasourceId());

        if (permission.getAllowQuery() == null) {
            permission.setAllowQuery(1);
        }
        if (permission.getAllowSql() == null) {
            permission.setAllowSql(0);
        }
        if (permission.getMaxQueryRows() == null || permission.getMaxQueryRows() <= 0) {
            permission.setMaxQueryRows(DEFAULT_MAX_ROWS);
        }
        if (StringUtils.isBlank(permission.getTableNames())) {
            permission.setTableNames(WILDCARD_ALL);
        } else {
            permission.setTableNames(permission.getTableNames().trim());
        }

        Date now = new Date();
        permission.setUpdateTime(now);

        if (exist != null) {
            permission.setId(exist.getId());
            return jobRoleTablePermissionMapper.updateById(permission) > 0;
        } else {
            permission.setCreateTime(now);
            return jobRoleTablePermissionMapper.insert(permission) > 0;
        }
    }

    @Override
    public List<JobRoleTablePermission> getPermissionsByRole(String roleCode) {
        return jobRoleTablePermissionMapper.listByRoleCode(roleCode);
    }

    @Override
    public List<JobRoleTablePermission> getAllPermissions() {
        return jobRoleTablePermissionMapper.listAllPermissions();
    }

    /**
     * 比对表名是否命中授权规则（支持全表通配符 * 以及精确/前缀忽略大小写比对）
     *
     * @param ruleStr 配置的表名规则（逗号分隔）
     * @param targetTableName 目标表名
     * @return 是否命中
     */
    private boolean matchTableName(String ruleStr, String targetTableName) {
        if (StringUtils.isBlank(ruleStr) || StringUtils.isBlank(targetTableName)) {
            return false;
        }
        String cleanTarget = targetTableName.trim();
        for (String rule : ruleStr.split(",")) {
            String cleanRule = rule.trim();
            if (WILDCARD_ALL.equals(cleanRule)) {
                return true;
            }
            if (cleanRule.endsWith("*")) {
                String prefix = cleanRule.substring(0, cleanRule.length() - 1);
                if (cleanTarget.toLowerCase().startsWith(prefix.toLowerCase())) {
                    return true;
                }
            } else if (cleanRule.equalsIgnoreCase(cleanTarget)) {
                return true;
            }
        }
        return false;
    }
}
