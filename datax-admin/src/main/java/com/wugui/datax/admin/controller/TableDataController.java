package com.wugui.datax.admin.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.api.R;
import com.wugui.datax.admin.dto.DatabaseSchemaDto;
import com.wugui.datax.admin.dto.ExecuteSqlDto;
import com.wugui.datax.admin.dto.TableColumnDto;
import com.wugui.datax.admin.dto.TableDataQueryDto;
import com.wugui.datax.admin.dto.TableDataResultDto;
import com.wugui.datax.admin.dto.TableInfoDto;
import com.wugui.datax.admin.service.TableDataService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import com.wugui.datax.admin.entity.JobDatasource;
import com.wugui.datax.admin.entity.JobRoleTablePermission;
import com.wugui.datax.admin.entity.JobRole;
import com.wugui.datax.admin.entity.JobRoleMenuPermission;
import com.wugui.datax.admin.entity.JobUser;
import com.wugui.datax.admin.mapper.JobUserMapper;
import com.wugui.datax.admin.service.JobDatasourceService;
import com.wugui.datax.admin.service.JobRoleService;
import com.wugui.datax.admin.service.RoleMenuPermissionService;
import com.wugui.datax.admin.service.TablePermissionService;
import com.wugui.datax.admin.util.JwtTokenUtils;

import javax.servlet.http.HttpServletRequest;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 零代码简易查库与数据预览前端控制器
 *
 * @author ypc
 * @since 2026-09-11
 */
@RestController
@RequestMapping("/api/tableData")
@Api(tags = "智能助手-库表简易查询API")
public class TableDataController extends BaseController {

    @Autowired
    private TableDataService tableDataService;

    @Autowired
    private JobDatasourceService jobDatasourceService;

    @Autowired
    private TablePermissionService tablePermissionService;

    @Autowired
    private RoleMenuPermissionService roleMenuPermissionService;

    @Autowired
    private JobUserMapper jobUserMapper;

    @Autowired
    private JobRoleService jobRoleService;

    /**
     * 从当前请求解析登录用户的角色标识
     *
     * @param request HTTP 请求
     * @return 角色标识（如 ROLE_ADMIN, ROLE_USER），默认返回 ROLE_USER
     */
    private String resolveCurrentRole(HttpServletRequest request) {
        if (request == null) {
            return "ROLE_USER";
        }
        String token = JwtTokenUtils.extractToken(request);
        if (StringUtils.isNotBlank(token)) {
            try {
                String role = JwtTokenUtils.getUserRole(token);
                if (StringUtils.isNotBlank(role)) {
                    return role.trim();
                }
            } catch (Exception e) {
                logger.warn("[TableDataController] 解析角色 Token 异常: {}", e.getMessage());
            }
        }
        return "ROLE_USER";
    }

    /**
     * 判断当前请求用户是否具有管理员特权
     *
     * @param request HTTP 请求
     * @return 是否为管理员
     */
    private boolean isCurrentAdmin(HttpServletRequest request) {
        String role = resolveCurrentRole(request);
        return "ROLE_ADMIN".equalsIgnoreCase(role) || "1".equals(role);
    }

    /**
     * 从简单 SELECT SQL 中正则抽取表名用于权限白名单比对
     *
     * @param sql SQL 文本
     * @return 涉及的表名列表
     */
    private List<String> extractTableNamesFromSql(String sql) {
        List<String> tables = new ArrayList<>();
        if (StringUtils.isBlank(sql)) {
            return tables;
        }
        Pattern pattern = Pattern.compile("(?i)\\b(?:from|join)\\s+[`\"']?([a-zA-Z0-9_]+)[`\"']?");
        Matcher matcher = pattern.matcher(sql);
        while (matcher.find()) {
            String tbl = matcher.group(1);
            if (StringUtils.isNotBlank(tbl) && !tables.contains(tbl)) {
                tables.add(tbl);
            }
        }
        return tables;
    }

    /**
     * 获取所有可用数据源列表（支持按名称/备注/数据库名模糊过滤，并返回备注）
     *
     * @param keyword 综合搜索关键词 (匹配库名、备注或数据库名)
     * @param comments 库备注搜索词 (单独按备注模糊查询)
     * @param datasourceName 库名称搜索词 (单独按库名模糊查询)
     * @return 数据源列表 (携带库备注 comments，密码已脱敏)
     */
    @GetMapping("/datasources")
    @ApiOperation("获取所有可用数据源列表")
    public R<List<JobDatasource>> getAllDatasources(
            HttpServletRequest request,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String comments,
            @RequestParam(required = false) String datasourceName) {
        String role = resolveCurrentRole(request);
        List<Long> allowedDsIds = tablePermissionService.getAllowedDatasourceIds(role);
        if (allowedDsIds != null && allowedDsIds.isEmpty()) {
            return success(new ArrayList<>());
        }

        QueryWrapper<JobDatasource> qw = new QueryWrapper<>();
        boolean hasCondition = false;
        if (allowedDsIds != null) {
            qw.in("id", allowedDsIds);
            hasCondition = true;
        }
        if (StringUtils.isNotBlank(comments)) {
            qw.like("comments", comments.trim());
            hasCondition = true;
        }
        if (StringUtils.isNotBlank(datasourceName)) {
            qw.like("datasource_name", datasourceName.trim());
            hasCondition = true;
        }
        if (StringUtils.isNotBlank(keyword)) {
            String cleanKw = keyword.trim();
            qw.and(wrapper -> wrapper.like("datasource_name", cleanKw)
                    .or().like("comments", cleanKw)
                    .or().like("database_name", cleanKw));
            hasCondition = true;
        }

        List<JobDatasource> list = hasCondition ? jobDatasourceService.list(qw) : jobDatasourceService.selectAllDatasource();
        if (list != null) {
            for (JobDatasource ds : list) {
                // 安全审计：清空敏感密码
                ds.setJdbcPassword(null);
            }
        }
        return success(list);
    }

    /**
     * 分页查询库表数据
     *
     * @param queryDto 查询参数对象
     * @return 包含列元数据、数据行、总数与耗时的结果
     */
    @PostMapping("/query")
    @ApiOperation("分页查询库表数据")
    public R<TableDataResultDto> queryTableData(
            HttpServletRequest request,
            @RequestBody TableDataQueryDto queryDto) {
        if (queryDto.getDatasourceId() == null) {
            return failed("数据源ID不能为空");
        }
        if (StringUtils.isBlank(queryDto.getTableName())) {
            return failed("表名不能为空");
        }
        String role = resolveCurrentRole(request);
        if (!tablePermissionService.isTableAllowed(role, queryDto.getDatasourceId(), queryDto.getTableName())) {
            return failed("安全拦截: 您暂无访问数据表 [" + queryDto.getTableName() + "] 的权限，请联系管理员授权");
        }
        if (!tablePermissionService.isQueryAllowed(role, queryDto.getDatasourceId(), queryDto.getTableName())) {
            return failed("安全拦截: 您当前仅拥有查看字段结构的权限，未开通数据预览权限");
        }

        // 行数保护截断
        int maxRows = tablePermissionService.getMaxQueryRows(role, queryDto.getDatasourceId());
        if (queryDto.getPageSize() == null || queryDto.getPageSize() > maxRows) {
            queryDto.setPageSize(maxRows);
        }

        try {
            TableDataResultDto result = tableDataService.queryTableData(queryDto);
            return success(result);
        } catch (SecurityException se) {
            return failed("安全拦截: " + se.getMessage());
        } catch (Exception e) {
            return failed("数据查询失败: " + e.getMessage());
        }
    }

    /**
     * 执行只读自定义 SQL 查询
     *
     * @param executeSqlDto SQL 请求对象
     * @return 查询结果
     */
    @PostMapping("/executeSql")
    @ApiOperation("安全执行只读自定义 SQL 查询")
    public R<TableDataResultDto> executeReadOnlySql(
            HttpServletRequest request,
            @RequestBody ExecuteSqlDto executeSqlDto) {
        if (executeSqlDto.getDatasourceId() == null) {
            return failed("数据源ID不能为空");
        }
        if (StringUtils.isBlank(executeSqlDto.getSql())) {
            return failed("SQL语句不能为空");
        }
        String role = resolveCurrentRole(request);
        if (!tablePermissionService.isSqlAllowed(role, executeSqlDto.getDatasourceId())) {
            return failed("安全拦截: 当前角色未被开通在目标库执行自定义 SQL 的权限");
        }

        // 非管理员校验涉案表是否全部位于白名单内
        if (!"ROLE_ADMIN".equalsIgnoreCase(role) && !"1".equals(role)) {
            List<String> tables = extractTableNamesFromSql(executeSqlDto.getSql());
            for (String tbl : tables) {
                if (!tablePermissionService.isTableAllowed(role, executeSqlDto.getDatasourceId(), tbl)) {
                    return failed("安全拦截: SQL 中引用的数据表 [" + tbl + "] 未授权，禁止执行");
                }
            }
        }

        try {
            TableDataResultDto result = tableDataService.executeReadOnlySql(executeSqlDto);
            return success(result);
        } catch (SecurityException se) {
            return failed("安全拦截: " + se.getMessage());
        } catch (Exception e) {
            return failed("SQL执行失败: " + e.getMessage());
        }
    }

    /**
     * 获取表字段详细元数据
     *
     * @param datasourceId 数据源ID
     * @param tableSchema Schema名 (可选)
     * @param tableName 表名
     * @return 字段列表
     */
    @GetMapping("/columns")
    @ApiOperation("获取表字段详细元数据")
    public R<List<TableColumnDto>> getTableColumns(
            HttpServletRequest request,
            @RequestParam Long datasourceId,
            @RequestParam(required = false) String tableSchema,
            @RequestParam String tableName) {
        if (datasourceId == null) {
            return failed("数据源ID不能为空");
        }
        if (StringUtils.isBlank(tableName)) {
            return failed("表名不能为空");
        }
        String role = resolveCurrentRole(request);
        if (!tablePermissionService.isTableAllowed(role, datasourceId, tableName)) {
            return failed("安全拦截: 您暂无访问数据表 [" + tableName + "] 字段的权限");
        }

        try {
            List<TableColumnDto> columns = tableDataService.getTableColumnsDetails(datasourceId, tableSchema, tableName);
            return success(columns);
        } catch (SecurityException se) {
            return failed("安全拦截: " + se.getMessage());
        } catch (Exception e) {
            return failed("获取字段信息失败: " + e.getMessage());
        }
    }

    /**
     * 快速获取表总记录数
     *
     * @param datasourceId 数据源ID
     * @param tableSchema Schema名 (可选)
     * @param tableName 表名
     * @param whereClause 过滤条件 (可选)
     * @return 总记录数
     */
    @GetMapping("/count")
    @ApiOperation("快速获取表总记录数")
    public R<Long> getTableCount(
            HttpServletRequest request,
            @RequestParam Long datasourceId,
            @RequestParam(required = false) String tableSchema,
            @RequestParam String tableName,
            @RequestParam(required = false) String whereClause) {
        if (datasourceId == null) {
            return failed("数据源ID不能为空");
        }
        if (StringUtils.isBlank(tableName)) {
            return failed("表名不能为空");
        }
        String role = resolveCurrentRole(request);
        if (!tablePermissionService.isTableAllowed(role, datasourceId, tableName)) {
            return failed("安全拦截: 您暂无访问数据表 [" + tableName + "] 的权限");
        }

        try {
            Long count = tableDataService.getTableCount(datasourceId, tableSchema, tableName, whereClause);
            return success(count);
        } catch (SecurityException se) {
            return failed("安全拦截: " + se.getMessage());
        } catch (Exception e) {
            return failed("统计总数失败: " + e.getMessage());
        }
    }

    /**
     * 获取数据源下的所有表及注解信息
     *
     * @param datasourceId 数据源ID
     * @param tableSchema  Schema名 (可选)
     * @return 包含表名与注解的列表
     */
    @GetMapping("/tables")
    @ApiOperation("获取数据源下的所有表及注解信息")
    public R<List<TableInfoDto>> getTables(
            HttpServletRequest request,
            @RequestParam Long datasourceId,
            @RequestParam(required = false) String tableSchema) {
        if (datasourceId == null) {
            return failed("数据源ID不能为空");
        }
        String role = resolveCurrentRole(request);
        try {
            List<TableInfoDto> tables = tableDataService.getTablesWithComments(datasourceId, tableSchema);
            // 权限过滤：非管理员仅返回白名单授权的表
            if (tables != null && !"ROLE_ADMIN".equalsIgnoreCase(role) && !"1".equals(role)) {
                List<TableInfoDto> filtered = new ArrayList<>();
                for (TableInfoDto t : tables) {
                    if (tablePermissionService.isTableAllowed(role, datasourceId, t.getTableName())) {
                        filtered.add(t);
                    }
                }
                return success(filtered);
            }
            return success(tables);
        } catch (SecurityException se) {
            return failed("安全拦截: " + se.getMessage());
        } catch (Exception e) {
            return failed("获取表清单失败: " + e.getMessage());
        }
    }

    /**
     * 批量导出库表完整结构元数据
     *
     * @param datasourceId 数据源ID
     * @param tableSchema  Schema名 (可选)
     * @param tableNames   逗号分隔的表名 (可选)
     * @return 包含库信息、表列表与各表字段详情的完整元数据对象
     */
    @GetMapping("/exportSchema")
    @ApiOperation("批量导出库表完整结构元数据")
    public R<DatabaseSchemaDto> exportDatabaseSchema(
            HttpServletRequest request,
            @RequestParam Long datasourceId,
            @RequestParam(required = false) String tableSchema,
            @RequestParam(required = false) String tableNames) {
        if (datasourceId == null) {
            return failed("数据源ID不能为空");
        }
        String role = resolveCurrentRole(request);
        try {
            List<String> tableNameList = null;
            if (StringUtils.isNotBlank(tableNames)) {
                tableNameList = new ArrayList<>(Arrays.asList(tableNames.split(",")));
            } else {
                List<TableInfoDto> allTables = tableDataService.getTablesWithComments(datasourceId, tableSchema);
                if (allTables != null) {
                    tableNameList = new ArrayList<>();
                    for (TableInfoDto t : allTables) {
                        tableNameList.add(t.getTableName());
                    }
                }
            }

            // 非管理员过滤未授权表
            if (tableNameList != null && !"ROLE_ADMIN".equalsIgnoreCase(role) && !"1".equals(role)) {
                List<String> allowedList = new ArrayList<>();
                for (String t : tableNameList) {
                    if (tablePermissionService.isTableAllowed(role, datasourceId, t)) {
                        allowedList.add(t);
                    }
                }
                tableNameList = allowedList;
            }

            DatabaseSchemaDto schemaDto = tableDataService.getDatabaseFullSchema(datasourceId, tableSchema, tableNameList);
            return success(schemaDto);
        } catch (SecurityException se) {
            return failed("安全拦截: " + se.getMessage());
        } catch (Exception e) {
            return failed("获取库表结构失败: " + e.getMessage());
        }
    }

    // ==========================================
    // 角色库表权限管理接口 (仅管理员可操作)
    // ==========================================

    /**
     * 查询角色库表授权配置列表
     *
     * @param request HTTP 请求
     * @param roleCode 角色编码 (可选)
     * @return 授权配置列表
     */
    @GetMapping("/permission/list")
    @ApiOperation("获取角色库表权限配置列表 (仅管理员)")
    public R<List<JobRoleTablePermission>> listPermissions(
            HttpServletRequest request,
            @RequestParam(required = false) String roleCode) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可查看角色库表权限配置");
        }
        if (StringUtils.isNotBlank(roleCode)) {
            return success(tablePermissionService.getPermissionsByRole(roleCode.trim()));
        }
        return success(tablePermissionService.getAllPermissions());
    }

    /**
     * 保存或更新角色库表权限配置
     *
     * @param request HTTP 请求
     * @param permission 授权实体对象
     * @return 结果
     */
    @PostMapping("/permission/save")
    @ApiOperation("保存角色库表权限配置 (仅管理员)")
    public R<String> savePermission(
            HttpServletRequest request,
            @RequestBody JobRoleTablePermission permission) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可保存角色库表权限配置");
        }
        if (permission == null || StringUtils.isBlank(permission.getRoleCode()) || permission.getDatasourceId() == null) {
            return failed("参数错误: 角色编码与数据源ID不能为空");
        }
        boolean ok = tablePermissionService.saveOrUpdateRolePermission(permission);
        return ok ? success("保存角色库表权限成功") : failed("保存角色库表权限失败");
    }

    /**
     * 删除角色库表权限配置
     *
     * @param request HTTP 请求
     * @param id 权限配置主键ID
     * @return 结果
     */
    @PostMapping("/permission/delete")
    @ApiOperation("删除角色库表权限配置 (仅管理员)")
    public R<String> deletePermission(
            HttpServletRequest request,
            @RequestParam Integer id) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可删除权限配置");
        }
        if (id == null) {
            return failed("ID不能为空");
        }
        boolean ok = tablePermissionService.removeById(id);
        return ok ? success("删除成功") : failed("删除失败");
    }

    /**
     * 查询当前登录角色在指定数据源下的生效权限画像 (用于前端工作台动态展示 SQL 控制台与数据预览权限)
     *
     * @param request HTTP 请求
     * @param datasourceId 数据源ID (必填)
     * @return 包含 allowSql, allowQuery, maxQueryRows 等权限画像
     */
    @GetMapping("/permission/current")
    @ApiOperation("查询当前登录角色在指定数据源下的生效权限画像")
    public R<Map<String, Object>> getCurrentDatasourcePermission(
            HttpServletRequest request,
            @RequestParam Long datasourceId) {
        if (datasourceId == null) {
            return failed("数据源ID不能为空");
        }
        String role = resolveCurrentRole(request);
        boolean isAdmin = "ROLE_ADMIN".equalsIgnoreCase(role) || "1".equals(role);
        boolean isSql = tablePermissionService.isSqlAllowed(role, datasourceId);
        int maxRows = tablePermissionService.getMaxQueryRows(role, datasourceId);

        Map<String, Object> map = new HashMap<>();
        map.put("datasourceId", datasourceId);
        map.put("role", role);
        map.put("isAdmin", isAdmin);
        map.put("allowSql", isSql);
        map.put("maxQueryRows", maxRows);
        return success(map);
    }

    // ==========================================
    // 角色系统菜单权限管理接口
    // ==========================================

    /**
     * 获取指定角色或当前登录用户的系统菜单访问白名单
     *
     * @param request HTTP 请求
     * @param roleCode 角色编码 (可选，不传默认解析当前登录角色)
     * @return 允许访问的菜单标识列表
     */
    @GetMapping("/roleMenu/get")
    @ApiOperation("获取角色允许访问的系统菜单列表")
    public R<List<String>> getRoleMenus(
            HttpServletRequest request,
            @RequestParam(required = false) String roleCode,
            @RequestParam(required = false) String roleKey) {
        String effectiveRole = StringUtils.isNotBlank(roleCode) ? roleCode.trim()
                : (StringUtils.isNotBlank(roleKey) ? roleKey.trim() : resolveCurrentRole(request));
        return success(roleMenuPermissionService.getRoleAllowedMenuCodes(effectiveRole));
    }

    /**
     * 查询所有角色系统菜单授权配置列表 (仅管理员)
     *
     * @param request HTTP 请求
     * @return 列表
     */
    @GetMapping("/roleMenu/list")
    @ApiOperation("查询所有角色系统菜单配置列表 (仅管理员)")
    public R<List<JobRoleMenuPermission>> listRoleMenus(HttpServletRequest request) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可查看角色菜单配置");
        }
        return success(roleMenuPermissionService.getAllRoleMenuPermissions());
    }

    /**
     * 保存或更新角色系统菜单授权配置 (仅管理员)
     *
     * @param request HTTP 请求
     * @param permission 实体
     * @return 结果
     */
    @PostMapping("/roleMenu/save")
    @ApiOperation("保存角色系统菜单配置 (仅管理员)")
    public R<String> saveRoleMenu(
            HttpServletRequest request,
            @RequestBody JobRoleMenuPermission permission) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可保存角色菜单配置");
        }
        if (permission == null || StringUtils.isBlank(permission.getRoleCode())) {
            return failed("参数错误: 角色编码不能为空");
        }
        String role = permission.getRoleCode().trim();
        if ("ROLE_ADMIN".equalsIgnoreCase(role) || "ADMIN".equalsIgnoreCase(role) || "1".equals(role)) {
            return failed("管理员角色默认拥有系统全量功能菜单特权，无需单独配置策略");
        }
        boolean ok = roleMenuPermissionService.saveOrUpdateRoleMenuPermission(permission);
        return ok ? success("保存角色菜单权限成功") : failed("保存角色菜单权限失败");
    }

    /**
     * 删除角色系统菜单配置 (仅管理员，并级联清理该角色的库表权限规则、角色实体与用户绑定)
     *
     * @param request HTTP 请求
     * @param id 主键ID
     * @return 结果
     */
    @PostMapping("/roleMenu/delete")
    @ApiOperation("删除角色系统菜单配置 (仅管理员)")
    public R<String> deleteRoleMenu(
            HttpServletRequest request,
            @RequestParam Integer id) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可删除角色菜单配置");
        }
        if (id == null) {
            return failed("ID不能为空");
        }
        JobRoleMenuPermission perm = roleMenuPermissionService.getById(id);
        if (perm == null) {
            return failed("未找到待删除的菜单配置记录");
        }
        String roleCode = perm.getRoleCode();
        if (StringUtils.isNotBlank(roleCode)) {
            // 级联清理该角色、库表权限、菜单权限及用户关联
            String err = jobRoleService.deleteRole(roleCode.trim());
            if (err != null) {
                return failed(err);
            }
            return success("已成功删除角色 [" + roleCode + "] 及其所有库表授权规则与菜单策略");
        }
        boolean ok = roleMenuPermissionService.removeById(id);
        return ok ? success("删除成功") : failed("删除失败");
    }

    /**
     * 查询指定角色已关联的用户列表
     *
     * @param request HTTP 请求
     * @param roleCode 角色编码
     * @return 用户列表
     */
    @GetMapping("/roleUser/list")
    @ApiOperation("查询指定角色已关联的用户列表 (仅管理员)")
    public R<List<JobUser>> getRoleUsers(
            HttpServletRequest request,
            @RequestParam String roleCode) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可查看角色用户");
        }
        if (StringUtils.isBlank(roleCode)) {
            return failed("角色编码不能为空");
        }
        List<JobUser> users = jobUserMapper.findByRole(roleCode.trim());
        return success(users);
    }

    /**
     * 查询系统全部用户 (供角色选择添加关联，脱敏处理)
     *
     * @param request HTTP 请求
     * @return 全部用户列表
     */
    @GetMapping("/roleUser/all")
    @ApiOperation("查询系统全部用户(选择器用)")
    public R<List<JobUser>> getAllUsersForRole(HttpServletRequest request) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可查看用户列表");
        }
        List<JobUser> all = jobUserMapper.findAll(null);
        return success(all);
    }

    /**
     * 将指定用户关联到该角色
     *
     * @param request HTTP 请求
     * @param userId 用户ID
     * @param roleCode 目标角色编码
     * @return 操作结果
     */
    @PostMapping("/roleUser/assign")
    @ApiOperation("将指定用户关联到该角色 (仅管理员)")
    public R<String> assignUserRole(
            HttpServletRequest request,
            @RequestParam Integer userId,
            @RequestParam String roleCode) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可分配用户角色");
        }
        if (userId == null || StringUtils.isBlank(roleCode)) {
            return failed("用户ID与角色编码不能为空");
        }
        int rows = jobUserMapper.updateUserRole(userId, roleCode.trim());
        return rows > 0 ? success("关联成功") : failed("用户不存在或更新失败");
    }

    /**
     * 将指定用户从当前角色移除 (重置为普通角色 ROLE_USER)
     *
     * @param request HTTP 请求
     * @param userId 用户ID
     * @return 操作结果
     */
    @PostMapping("/roleUser/remove")
    @ApiOperation("将用户从当前角色移除 (仅管理员)")
    public R<String> removeUserRole(
            HttpServletRequest request,
            @RequestParam Integer userId) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可操作用户角色");
        }
        if (userId == null) {
            return failed("用户ID不能为空");
        }
        int rows = jobUserMapper.updateUserRole(userId, "ROLE_USER");
        return rows > 0 ? success("已移除角色关联") : failed("用户不存在或操作失败");
    }

    // ==========================================
    // 系统角色字典管理接口
    // ==========================================

    /**
     * 查询系统全部角色列表 (供角色下拉框与授权中心使用)
     *
     * @param request HTTP 请求
     * @return 角色列表
     */
    @GetMapping("/role/list")
    @ApiOperation("查询系统全部角色列表")
    public R<List<JobRole>> listRoles(HttpServletRequest request) {
        return success(jobRoleService.listAllRoles());
    }

    /**
     * 新增自定义角色 (仅管理员)
     *
     * @param request HTTP 请求
     * @param jobRole 角色实体
     * @return 操作结果
     */
    @PostMapping("/role/add")
    @ApiOperation("新增自定义角色 (仅管理员)")
    public R<String> addRole(
            HttpServletRequest request,
            @RequestBody JobRole jobRole) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可新增系统角色");
        }
        String errorMsg = jobRoleService.addRole(jobRole);
        return errorMsg == null ? success("角色创建成功") : failed(errorMsg);
    }

    /**
     * 删除指定角色及其所有关联配置 (仅管理员，级联清理库表权限、菜单策略与用户重置)
     *
     * @param request HTTP 请求
     * @param roleCode 角色标识
     * @return 操作结果
     */
    @PostMapping("/role/delete")
    @ApiOperation("删除指定角色及其全部关联权限 (仅管理员)")
    public R<String> deleteRole(
            HttpServletRequest request,
            @RequestParam String roleCode) {
        if (!isCurrentAdmin(request)) {
            return failed("无权限: 仅管理员可删除系统角色");
        }
        if (StringUtils.isBlank(roleCode)) {
            return failed("角色编码不能为空");
        }
        String errorMsg = jobRoleService.deleteRole(roleCode.trim());
        return errorMsg == null ? success("角色及其所有关联权限规则已成功清理") : failed(errorMsg);
    }
}
