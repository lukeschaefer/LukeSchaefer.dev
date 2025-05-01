declare module 'astro:env/client' {
	export const WEBMENTION_URL: string | undefined;	
	export const WEBMENTION_PINGBACK: string | undefined;	
}declare module 'astro:env/server' {
	export const WEBMENTION_API_KEY: string | undefined;	
}