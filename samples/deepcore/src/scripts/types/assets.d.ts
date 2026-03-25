/// <reference types="vite/client" />

declare module '*?url' {
    const content: string;
    export default content;
}

declare module '*.glb' {
    const content: string;
    export default content;
}

declare module '*.gltf' {
    const content: string;
    export default content;
}

declare module '*.glsl?raw' {
    const content: string;
    export default content;
}

declare module '*.vert?raw' {
    const content: string;
    export default content;
}

declare module '*.frag?raw' {
    const content: string;
    export default content;
}
