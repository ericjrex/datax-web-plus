package com.wugui.datax.admin.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.wugui.datax.admin.entity.JobApiAccount;
import com.wugui.datax.admin.mapper.JobApiAccountMapper;
import com.wugui.datax.admin.service.JobApiAccountService;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.Date;
import java.util.UUID;

/**
 * 外部 API 接口账号及权限服务实现类
 *
 * @author ypc
 * @since 2026-10-28
 */
@Service
public class JobApiAccountServiceImpl extends ServiceImpl<JobApiAccountMapper, JobApiAccount>
        implements JobApiAccountService {

    private static final String SECRET_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    @Autowired
    private JobApiAccountMapper jobApiAccountMapper;

    /**
     * 生成安全随机密钥
     */
    private static String generateSecret(int length) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(SECRET_CHARS.charAt(RANDOM.nextInt(SECRET_CHARS.length())));
        }
        return sb.toString();
    }

    @Override
    public JobApiAccount getActiveAccount(String appKey) {
        if (StringUtils.isBlank(appKey)) {
            return null;
        }
        JobApiAccount account = jobApiAccountMapper.getByAppKey(appKey.trim());
        if (account != null && Integer.valueOf(1).equals(account.getStatus())) {
            return account;
        }
        return null;
    }

    @Override
    public JobApiAccount createAccount(JobApiAccount account) {
        if (account == null) {
            throw new IllegalArgumentException("账号配置不能为空");
        }
        if (StringUtils.isBlank(account.getAppKey())) {
            account.setAppKey("ak_" + UUID.randomUUID().toString().replace("-", "").substring(0, 20));
        }
        if (StringUtils.isBlank(account.getAppSecret())) {
            account.setAppSecret(generateSecret(32));
        }
        if (account.getRateLimitQps() == null || account.getRateLimitQps() <= 0) {
            account.setRateLimitQps(10);
        }
        if (account.getStatus() == null) {
            account.setStatus(1);
        }
        account.setCreateTime(new Date());
        account.setUpdateTime(new Date());
        this.save(account);
        return account;
    }

    @Override
    public String resetSecret(Integer id) {
        if (id == null) {
            throw new IllegalArgumentException("账号ID不能为空");
        }
        JobApiAccount account = this.getById(id);
        if (account == null) {
            throw new IllegalArgumentException("未找到ID为 " + id + " 的账号");
        }
        String newSecret = generateSecret(32);
        account.setAppSecret(newSecret);
        account.setUpdateTime(new Date());
        this.updateById(account);
        return newSecret;
    }
}
