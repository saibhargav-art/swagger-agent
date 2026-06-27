import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { webMCPService } from '@/services/webmcp/WebMCPService';

type AuthUser = {
    role?: string;
    scopes?: string[];
    email?: string;
};

interface AuthContextValue {
    accessToken: string | null;
    user: AuthUser | null;
    login: (token: string) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (payload.length % 4 !== 0) {
            payload += '=';
        }
        const decoded = atob(payload);
        return JSON.parse(decodeURIComponent(
            decoded
                .split('')
                .map((c) => `%${('00' + c.charCodeAt(0).toString(16)).slice(-2)}`)
                .join('')
        ));
    } catch {
        return null;
    }
}

function normalizeScopeClaim(value: unknown): string[] | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') {
        return value
            .split(/[\s,]+/)
            .map((scope) => scope.trim())
            .filter(Boolean);
    }

    if (typeof value === 'number') {
        return [String(value)];
    }

    if (Array.isArray(value)) {
        return value
            .flatMap((item) =>
                typeof item === 'string'
                    ? item.split(/[\s,]+/)
                    : typeof item === 'number'
                        ? [String(item)]
                        : []
            )
            .map((scope) => scope.trim())
            .filter(Boolean);
    }

    if (typeof value === 'object' && value !== null) {
        const record = value as Record<string, unknown>;
        const nested = record.scopes ??
            record.permissions ??
            record.scope ??
            record.role ??
            record.roles;
        if (nested) {
            return normalizeScopeClaim(nested);
        }

        const values = Object.values(record).flatMap((item) => normalizeScopeClaim(item) ?? []);
        return values.length > 0 ? Array.from(new Set(values)) : undefined;
    }

    return undefined;
}

function normalizeRoleClaim(value: unknown): string | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value)) {
        return value.find((item): item is string => typeof item === 'string');
    }
    if (typeof value === 'object' && value !== null) {
        const record = value as Record<string, unknown>;
        const nested = record.role ??
            record.current ??
            record.name ??
            record.roles;
        return normalizeRoleClaim(nested);
    }
    return undefined;
}

function getRecordValue(value: unknown, key: string): unknown {
    return typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)[key]
        : undefined;
}

function extractUserFromToken(token: string): AuthUser | null {
    const payload = decodeJwtPayload(token);
    if (!payload) return null;

    const appMetadata = getRecordValue(payload, 'app_metadata');
    const userMetadata = getRecordValue(payload, 'user_metadata');
    const realmAccess = getRecordValue(payload, 'realm_access');
    const hasuraClaims = getRecordValue(payload, 'https://hasura.io/jwt/claims');
    const resourceAccess = getRecordValue(payload, 'resource_access');

    const rawRole =
        payload.role ??
        payload.roles ??
        payload['user_role'] ??
        getRecordValue(appMetadata, 'role') ??
        getRecordValue(appMetadata, 'roles') ??
        getRecordValue(realmAccess, 'roles') ??
        getRecordValue(hasuraClaims, 'x-hasura-default-role');

    const role = normalizeRoleClaim(rawRole);

    const scopeClaim =
        payload.scope ??
        payload.scopes ??
        payload.permissions ??
        payload['user_scopes'] ??
        payload['allowed_scopes'] ??
        getRecordValue(appMetadata, 'scopes') ??
        getRecordValue(appMetadata, 'permissions') ??
        getRecordValue(userMetadata, 'scopes') ??
        getRecordValue(userMetadata, 'permissions') ??
        getRecordValue(realmAccess, 'roles') ??
        (resourceAccess && typeof resourceAccess === 'object'
            ? Object.values(resourceAccess as Record<string, unknown>).flatMap((entry) =>
                normalizeScopeClaim(getRecordValue(entry, 'roles')) ?? []
            )
            : undefined);

    const scopes = normalizeScopeClaim(scopeClaim);

    const email = typeof payload.email === 'string' ? payload.email : undefined;

    return { role, scopes, email };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [user, setUser] = useState<AuthUser | null>(() => {
        if (!accessToken) return null;
        return extractUserFromToken(accessToken);
    });

    useEffect(() => {
        if (!accessToken) {
            setUser(null);
            webMCPService.setBearerToken(undefined);
            webMCPService.setInvocationContext({ userRole: undefined, userScopes: [] });
            return;
        }

        const nextUser = extractUserFromToken(accessToken);
        setUser(nextUser);
        webMCPService.setBearerToken(accessToken);
        webMCPService.setInvocationContext({
            userRole: nextUser?.role,
            userScopes: nextUser?.scopes ?? [],
        });
    }, [accessToken]);

    const login = (token: string) => {
        setAccessToken(token.trim() || null);
    };

    const logout = () => {
        setAccessToken(null);
    };

    const value = useMemo(
        () => ({ accessToken, user, login, logout }),
        [accessToken, user]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const value = useContext(AuthContext);
    if (!value) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return value;
}
