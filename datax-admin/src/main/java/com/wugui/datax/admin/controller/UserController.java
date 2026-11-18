package com.wugui.datax.admin.controller;

import cn.hutool.core.util.StrUtil;
import com.wugui.datatx.core.biz.model.ReturnT;
import com.wugui.datax.admin.core.util.I18nUtil;
import com.wugui.datax.admin.entity.JobUser;
import com.wugui.datax.admin.mapper.JobUserMapper;
import com.wugui.datax.admin.util.JwtTokenUtils;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import javax.servlet.http.HttpServletRequest;
import com.wugui.datax.admin.service.JobUserSettingService;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static com.wugui.datatx.core.biz.model.ReturnT.FAIL_CODE;

/**
 * Created by jingwk on 2019/11/17
 */
@RestController
@RequestMapping("/api/user")
@Api(tags = "用户信息接口")
public class UserController {

    private static final Logger log = LoggerFactory.getLogger(UserController.class);

    @Resource
    private JobUserMapper jobUserMapper;

    @Resource
    private BCryptPasswordEncoder bCryptPasswordEncoder;

    @Resource
    private JobUserSettingService jobUserSettingService;

    /**
     * 获取当前登录用户信息与角色权限
     *
     * @param request HTTP 请求
     * @return 包含 userId, username, role, isAdmin 的当前用户画像
     */
    @GetMapping("/current")
    @ApiOperation("获取当前登录用户信息与角色")
    public ReturnT<Map<String, Object>> getCurrentUser(HttpServletRequest request) {
        String token = JwtTokenUtils.extractToken(request);
        Map<String, Object> result = new HashMap<>();
        if (StringUtils.hasText(token)) {
            try {
                String username = JwtTokenUtils.getUsername(token);
                Integer userId = JwtTokenUtils.getUserId(token);
                String role = JwtTokenUtils.getUserRole(token);
                boolean isAdmin = "ROLE_ADMIN".equalsIgnoreCase(role) || "1".equals(role);
                result.put("userId", userId);
                result.put("username", username);
                result.put("role", role);
                result.put("isAdmin", isAdmin);
                return new ReturnT<>(result);
            } catch (Exception e) {
                log.warn("[UserController] 解析用户 Token 失败，原因: {}", e.getMessage());
            }
        }
        result.put("userId", 0);
        result.put("username", "guest");
        result.put("role", "ROLE_USER");
        result.put("isAdmin", false);
        return new ReturnT<>(result);
    }

    @GetMapping("/pageList")
    @ApiOperation("用户列表")
    public ReturnT<Map<String, Object>> pageList(@RequestParam(required = false, defaultValue = "1") int current,
                                                 @RequestParam(required = false, defaultValue = "10") int size,
                                                 String username) {

        // page list
        List<JobUser> list = jobUserMapper.pageList((current - 1) * size, size, username);
        int recordsTotal = jobUserMapper.pageListCount((current - 1) * size, size, username);

        // package result
        Map<String, Object> maps = new HashMap<>();
        maps.put("recordsTotal", recordsTotal);        // 总记录数
        maps.put("recordsFiltered", recordsTotal);    // 过滤后的总记录数
        maps.put("data", list);                    // 分页列表
        return new ReturnT<>(maps);
    }

    @GetMapping("/list")
    @ApiOperation("用户列表")
    public ReturnT<List<JobUser>> list(String username) {

        // page list
        List<JobUser> list = jobUserMapper.findAll(username);
        return new ReturnT<>(list);
    }

    @GetMapping("/getUserById")
    @ApiOperation(value = "根据id获取用户")
    public ReturnT<JobUser> selectById(@RequestParam("userId") Integer userId) {
        return new ReturnT<>(jobUserMapper.getUserById(userId));
    }

    @PostMapping("/add")
    @ApiOperation("添加用户")
    public ReturnT<String> add(@RequestBody JobUser jobUser) {

        // valid username
        if (!StringUtils.hasText(jobUser.getUsername())) {
            return new ReturnT<>(FAIL_CODE, I18nUtil.getString("system_please_input") + I18nUtil.getString("user_username"));
        }
        jobUser.setUsername(jobUser.getUsername().trim());
        if (!(jobUser.getUsername().length() >= 4 && jobUser.getUsername().length() <= 20)) {
            return new ReturnT<>(FAIL_CODE, I18nUtil.getString("system_length_limit") + "[4-20]");
        }
        // valid password
        if (!StringUtils.hasText(jobUser.getPassword())) {
            return new ReturnT<>(FAIL_CODE, I18nUtil.getString("system_please_input") + I18nUtil.getString("user_password"));
        }
        jobUser.setPassword(jobUser.getPassword().trim());
        if (!(jobUser.getPassword().length() >= 4 && jobUser.getPassword().length() <= 20)) {
            return new ReturnT<>(FAIL_CODE, I18nUtil.getString("system_length_limit") + "[4-20]");
        }
        jobUser.setPassword(bCryptPasswordEncoder.encode(jobUser.getPassword()));


        // check repeat
        JobUser existUser = jobUserMapper.loadByUserName(jobUser.getUsername());
        if (existUser != null) {
            return new ReturnT<>(FAIL_CODE, I18nUtil.getString("user_username_repeat"));
        }

        // write
        jobUserMapper.save(jobUser);
        return ReturnT.SUCCESS;
    }

    @PostMapping(value = "/update")
    @ApiOperation("更新用户信息")
    public ReturnT<String> update(@RequestBody JobUser jobUser) {
        if (StringUtils.hasText(jobUser.getPassword())) {
            String pwd = jobUser.getPassword().trim();
            if (StrUtil.isBlank(pwd)) {
                return new ReturnT<>(FAIL_CODE, I18nUtil.getString("system_no_blank") + "密码");
            }

            if (!(pwd.length() >= 4 && pwd.length() <= 20)) {
                return new ReturnT<>(FAIL_CODE, I18nUtil.getString("system_length_limit") + "[4-20]");
            }
            jobUser.setPassword(bCryptPasswordEncoder.encode(pwd));
        } else {
            return new ReturnT<>(FAIL_CODE, I18nUtil.getString("system_no_blank") + "密码");
        }
        // write
        jobUserMapper.update(jobUser);
        return ReturnT.SUCCESS;
    }

    @RequestMapping(value = "/remove", method = RequestMethod.POST)
    @ApiOperation("删除用户")
    public ReturnT<String> remove(int id) {
        int result = jobUserMapper.delete(id);
        return result != 1 ? ReturnT.FAIL : ReturnT.SUCCESS;
    }

    @PostMapping(value = "/updatePwd")
    @ApiOperation("修改密码")
    public ReturnT<String> updatePwd(@RequestBody JobUser jobUser) {
        String password = jobUser.getPassword();
        if (password == null || password.trim().length() == 0) {
            return new ReturnT<>(ReturnT.FAIL.getCode(), "密码不可为空");
        }
        password = password.trim();
        if (!(password.length() >= 4 && password.length() <= 20)) {
            return new ReturnT<>(FAIL_CODE, I18nUtil.getString("system_length_limit") + "[4-20]");
        }
        // do write
        JobUser existUser = jobUserMapper.loadByUserName(jobUser.getUsername());
        existUser.setPassword(bCryptPasswordEncoder.encode(password));
        jobUserMapper.update(existUser);
        return ReturnT.SUCCESS;
    }

    /**
     * 获取当前登录用户的个性化配置 (如 visible_tabs 选项卡可见性配置)
     *
     * @param key 配置键名
     * @param request HTTP 请求
     * @return 配置值
     */
    @GetMapping("/setting")
    @ApiOperation("获取当前登录用户的个性化配置")
    public ReturnT<String> getUserSetting(@RequestParam("key") String key, HttpServletRequest request) {
        String token = JwtTokenUtils.extractToken(request);
        if (!StringUtils.hasText(token)) {
            return new ReturnT<>(FAIL_CODE, "未获取到有效凭据");
        }
        try {
            Integer userId = JwtTokenUtils.getUserId(token);
            String val = jobUserSettingService.getSettingValue(userId, key);
            return new ReturnT<>(val);
        } catch (Exception e) {
            log.warn("[UserController] 获取用户个性化配置异常, key: {}, err: {}", key, e.getMessage());
            return new ReturnT<>(FAIL_CODE, "获取用户配置失败: " + e.getMessage());
        }
    }

    /**
     * 保存或更新当前登录用户的个性化配置
     *
     * @param params JSON 请求体参数 (包含 key, value)
     * @param paramKey URL 查询或表单 key 参数 (兼容兜底)
     * @param paramValue URL 查询或表单 value 参数 (兼容兜底)
     * @param request HTTP 请求
     * @return 操作结果
     */
    @PostMapping("/setting")
    @ApiOperation("保存当前登录用户的个性化配置")
    public ReturnT<String> saveUserSetting(@RequestBody(required = false) Map<String, String> params,
                                           @RequestParam(value = "key", required = false) String paramKey,
                                           @RequestParam(value = "value", required = false) String paramValue,
                                           HttpServletRequest request) {
        String token = JwtTokenUtils.extractToken(request);
        if (!StringUtils.hasText(token)) {
            return new ReturnT<>(FAIL_CODE, "未获取到有效凭据");
        }
        try {
            Integer userId = JwtTokenUtils.getUserId(token);
            String username = JwtTokenUtils.getUsername(token);

            String key = (params != null && params.containsKey("key")) ? params.get("key") : paramKey;
            String value = (params != null && params.containsKey("value")) ? params.get("value") : paramValue;

            if (!StringUtils.hasText(key)) {
                return new ReturnT<>(FAIL_CODE, "配置键名不能为空");
            }

            boolean ok = jobUserSettingService.saveSetting(userId, username, key.trim(), value);
            return ok ? ReturnT.SUCCESS : new ReturnT<>(FAIL_CODE, "保存用户配置失败");
        } catch (Exception e) {
            log.warn("[UserController] 保存用户个性化配置异常, err: {}", e.getMessage());
            return new ReturnT<>(FAIL_CODE, "保存用户配置失败: " + e.getMessage());
        }
    }

}
