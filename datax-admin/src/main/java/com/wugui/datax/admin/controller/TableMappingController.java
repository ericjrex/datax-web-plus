package com.wugui.datax.admin.controller;

import com.baomidou.mybatisplus.extension.api.R;
import com.wugui.datax.admin.dto.AutoBuildMappingDto;
import com.wugui.datax.admin.dto.ExecuteDDLDto;
import com.wugui.datax.admin.dto.TableMappingDto;
import com.wugui.datax.admin.dto.TablePrefixSuffixRuleDto;
import com.wugui.datax.admin.service.TableMappingService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;

/**
 * 表与字段映射配置控制器
 *
 * @author ypc
 */
@RestController
@RequestMapping("api/mapping")
@Api(tags = "表与字段映射配置控制器")
public class TableMappingController extends BaseController {

    @Autowired
    private TableMappingService tableMappingService;

    /**
     * 自动构建原表与目标表的表名及字段映射关系
     *
     * @param dto 自动构建请求对象
     * @return 表与字段映射明细列表
     * @throws IOException IO异常
     */
    @PostMapping("/autoBuild")
    @ApiOperation("自动构建原表和目标表字段映射关系")
    public R<List<TableMappingDto>> autoBuild(@RequestBody AutoBuildMappingDto dto) throws IOException {
        if (dto.getReaderDatasourceId() == null || dto.getWriterDatasourceId() == null) {
            return failed("请选择源数据源和目标数据源");
        }
        if (dto.getReaderTables() == null || dto.getReaderTables().isEmpty()) {
            return failed("请至少选择一张源表");
        }
        return success(tableMappingService.autoBuildTableMapping(dto));
    }

    /**
     * 批量预览命名规则转换后的目标表名
     *
     * @param tableNames 原表名列表
     * @param ruleDto 命名规则对象
     * @return 转换后的目标表名列表
     */
    @PostMapping("/previewNaming")
    @ApiOperation("批量预览表名前后缀与命名规则转换结果")
    public R<List<String>> previewNaming(@RequestParam List<String> tableNames, @RequestBody TablePrefixSuffixRuleDto ruleDto) {
        return success(tableMappingService.previewNaming(tableNames, ruleDto));
    }

    /**
     * 根据表映射配置生成目标库建表 DDL
     *
     * @param writerDatasourceId 目标数据源ID
     * @param mappingDto 表映射关系对象
     * @return 生成的建表 DDL
     */
    @PostMapping("/generateDDL")
    @ApiOperation("根据字段映射生成目标端建表 DDL")
    public R<String> generateDDL(@RequestParam Long writerDatasourceId, @RequestBody TableMappingDto mappingDto) {
        if (writerDatasourceId == null) {
            return failed("目标数据源ID不能为空");
        }
        return success(tableMappingService.generateDDL(writerDatasourceId, mappingDto));
    }

    /**
     * 在目标端数据源执行建表 DDL
     *
     * @param dto 执行 DDL 请求对象
     * @return 执行结果
     */
    @PostMapping("/executeDDL")
    @ApiOperation("在目标端数据源执行建表 DDL")
    public R<String> executeDDL(@RequestBody ExecuteDDLDto dto) {
        if (dto.getDatasourceId() == null) {
            return failed("目标数据源ID不能为空");
        }
        try {
            tableMappingService.executeDDL(dto.getDatasourceId(), dto.getDdlSql());
            return success("建表 DDL 执行成功！");
        } catch (SecurityException se) {
            return failed("安全拦截: " + se.getMessage());
        } catch (Exception e) {
            return failed("建表执行失败: " + e.getMessage());
        }
    }
}
