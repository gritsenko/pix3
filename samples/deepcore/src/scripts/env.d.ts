declare module 'ios-haptics' {
  interface HapticInterface {
    (): void;
    confirm(): void;
    error(): void;
    success(): void;
    warning(): void;
  }
  export const haptic: HapticInterface;
}

declare module '../assets/textures' {
  export const TEXTURES: any;
}

declare module '*.png' {
  const value: string;
  export default value;
}

