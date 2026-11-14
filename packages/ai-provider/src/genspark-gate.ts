// Naigen Desk: Genspark services are compiled out of this build.

/**
 * Build-time switch for every Genspark service (sign-in, LLM proxy, gsk CLI
 * search and media, cloud projects, community links, GitHub stars). It is a
 * plain constant with no Node imports so both the main process and renderer
 * components can import it. Flipping it back to true restores upstream behavior.
 */
export const GENSPARK_ENABLED: boolean = false
