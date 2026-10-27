declare module 'virtual:samsok-instance' {
  export const buildInfo: { version: string; builtAt: string };
  const instance: import('../../config/schema').Instance;
  export default instance;
}
