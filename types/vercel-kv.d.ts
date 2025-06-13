declare module '@vercel/kv' {
  interface KVStore {
    get(key: string): Promise<any>;
    set(key: string, value: any): Promise<string>;
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
  }
  
  export const kv: KVStore;
} 