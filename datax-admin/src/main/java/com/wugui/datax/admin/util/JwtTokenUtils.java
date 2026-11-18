package com.wugui.datax.admin.util;

import com.alibaba.fastjson.JSON;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;

import java.util.Arrays;
import java.util.Date;
import java.util.HashMap;
import java.util.List;

import static com.wugui.datatx.core.util.Constants.SPLIT_COMMA;
import org.springframework.util.StringUtils;

import javax.servlet.http.Cookie;
import javax.servlet.http.HttpServletRequest;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

/**
 * Created by jingwk on 2019/12/01
 */
public class JwtTokenUtils {

    public static final String TOKEN_HEADER = "Authorization";
    public static final String TOKEN_PREFIX = "Bearer ";

    private static final String SECRET = "datax_admin";
    private static final String ISS = "admin";

    // 角色的key
    private static final String ROLE_CLAIMS = "rol";

    // 过期时间是3600秒，既是24个小时
    private static final long EXPIRATION = 86400L;

    // 选择了记住我之后的过期时间为7天
    private static final long EXPIRATION_REMEMBER = 7 * EXPIRATION;

    // 创建token
    public static String createToken(Integer id, String username, String role, boolean isRememberMe) {
        long expiration = isRememberMe ? EXPIRATION_REMEMBER : EXPIRATION;
        HashMap<String, Object> map = new HashMap<>();
        map.put(ROLE_CLAIMS, role);
        return Jwts.builder()
                .signWith(SignatureAlgorithm.HS512, SECRET)
                .setClaims(map)
                .setIssuer(ISS)
                .setSubject(id + SPLIT_COMMA + username)
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + expiration * 1000))
                .compact();
    }

    // 从token中获取用户名
    public static String getUsername(String token) {
        List<String> userInfo = Arrays.asList(getTokenBody(token).getSubject().split(SPLIT_COMMA));
        return userInfo.get(1);
    }

    // 从token中获取用户名
    public static Integer getUserId(String token) {
        String s= JSON.toJSONString(getTokenBody(token).getSubject());
        List<String> userInfo = Arrays.asList(getTokenBody(token).getSubject().split(SPLIT_COMMA));
        return Integer.parseInt(userInfo.get(0));
    }

    // 获取用户角色
    public static String getUserRole(String token) {
        return (String) getTokenBody(token).get(ROLE_CLAIMS);
    }

    // 是否已过期
    public static boolean isExpiration(String token) {
        try {
            return getTokenBody(token).getExpiration().before(new Date());
        } catch (ExpiredJwtException e) {
            return true;
        }
    }

    private static Claims getTokenBody(String token) {
        return Jwts.parser()
                .setSigningKey(SECRET)
                .parseClaimsJws(token)
                .getBody();
    }

    /**
     * 安全清洗原始 Token，去除 Bearer 前缀、URL 编码、空格及首尾引号
     *
     * @param rawToken 原始凭据串
     * @return 清洗后的标准纯 JWT 字符串
     */
    public static String cleanToken(String rawToken) {
        if (!StringUtils.hasText(rawToken)) {
            return "";
        }
        String token = rawToken.trim();
        // 尝试解码可能存在的 URL 编码 (如 Bearer%20 或其他编码字符)
        if (token.contains("%")) {
            try {
                token = URLDecoder.decode(token, StandardCharsets.UTF_8.name());
            } catch (Exception ignored) {
            }
        }
        // 去除外层引号
        if ((token.startsWith("\"") && token.endsWith("\"")) || (token.startsWith("'") && token.endsWith("'"))) {
            token = token.substring(1, token.length() - 1).trim();
        }
        // 忽略大小写去除 Bearer 前缀
        if (token.toLowerCase().startsWith("bearer ")) {
            token = token.substring(7).trim();
        } else if (token.toLowerCase().startsWith("bearer%20")) {
            token = token.substring(9).trim();
        }
        // 二次去除首尾空格与引号
        token = token.trim();
        if ((token.startsWith("\"") && token.endsWith("\"")) || (token.startsWith("'") && token.endsWith("'"))) {
            token = token.substring(1, token.length() - 1).trim();
        }
        return token;
    }

    /**
     * 从 HTTP 请求中多源健壮提取并清洗 Token
     * 优先级: Authorization -> Admin-Token -> XXL-JOB-ACCESS-TOKEN -> Cookie (Admin-Token / token)
     *
     * @param request HTTP 请求对象
     * @return 清洗后的合法 Token，若未提取到则返回空字符串
     */
    public static String extractToken(HttpServletRequest request) {
        if (request == null) {
            return "";
        }
        String token = request.getHeader(TOKEN_HEADER);
        if (!StringUtils.hasText(token)) {
            token = request.getHeader("Admin-Token");
        }
        if (!StringUtils.hasText(token)) {
            token = request.getHeader("XXL-JOB-ACCESS-TOKEN");
        }
        if (!StringUtils.hasText(token) && request.getCookies() != null) {
            for (Cookie cookie : request.getCookies()) {
                if ("Admin-Token".equalsIgnoreCase(cookie.getName()) || "token".equalsIgnoreCase(cookie.getName())) {
                    token = cookie.getValue();
                    break;
                }
            }
        }
        return cleanToken(token);
    }
}
