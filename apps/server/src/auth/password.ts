/**
 * 密码哈希与 JWT 签发/校验
 *
 * - 密码：Bun.password（默认 scrypt，内置实现，零依赖）
 * - JWT：jose（HS256，密钥来自环境变量 MYYODA_SERVER_JWT_SECRET，默认 dev 密钥）
 */

import { SignJWT, jwtVerify } from 'jose'

const DEFAULT_JWT_SECRET = 'myyoda-server-dev-secret-change-me'
export const JWT_ALGORITHM = 'HS256'
export const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 天

function getJwtSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.MYYODA_SERVER_JWT_SECRET ?? DEFAULT_JWT_SECRET)
}

/** 使用 Bun.password 哈希密码 */
export function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password)
}

/** 校验密码与哈希是否匹配 */
export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash)
}

export interface JwtPayload {
  userId: string
  email: string
}

/** 签发 JWT */
export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(getJwtSecret())
}

/** 校验 JWT；非法/过期返回 null */
export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), { algorithms: [JWT_ALGORITHM] })
    const userId = payload.userId
    const email = payload.email
    if (typeof userId !== 'string' || typeof email !== 'string') return null
    return { userId, email }
  } catch {
    return null
  }
}

/** 校验邮箱格式（宽松：a@b.c） */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
