import {
	AmbientLight,
	AxesHelper,
	BoxGeometry,
	BufferGeometry,
	Color,
	DirectionalLight,
	Float32BufferAttribute,
	LineBasicMaterial,
	LineSegments,
	Mesh,
	MeshStandardMaterial,
	OrthographicCamera,
	PerspectiveCamera,
	Scene,
	Vector3,
	WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { injectable, ServiceLifetime } from '../fw/di';

@injectable(ServiceLifetime.Transient)
export class ViewportRendererService {
	private renderer: WebGLRenderer | null = null;
	private mainScene: Scene | null = null;
	private overlayScene: Scene | null = null;
	private perspectiveCamera: PerspectiveCamera | null = null;
	private overlayCamera: OrthographicCamera | null = null;
	private controls: OrbitControls | null = null;
	private animationHandle: number | null = null;
	private canvas: HTMLCanvasElement | null = null;
	private demoMesh: Mesh | null = null;
	private disposables: Array<{ dispose: () => void }> = [];

	initialize(canvas: HTMLCanvasElement): void {
		if (!canvas) {
			throw new Error('[ViewportRenderer] Canvas element is required for initialization.');
		}

		if (this.canvas === canvas && this.renderer) {
			return;
		}

		this.dispose();
		this.canvas = canvas;

		this.renderer = new WebGLRenderer({
			canvas,
			antialias: true,
			alpha: true,
		});
		this.renderer.autoClear = false;
		this.renderer.setClearColor(new Color('#111317'), 1);
		if (typeof window !== 'undefined') {
			this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		}

		this.mainScene = new Scene();
		this.overlayScene = new Scene();

		this.perspectiveCamera = new PerspectiveCamera(60, 1, 0.1, 200);
		this.perspectiveCamera.position.set(6, 4, 8);
		this.perspectiveCamera.lookAt(new Vector3(0, 0, 0));

		this.overlayCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
		this.overlayCamera.position.set(0, 0, 2);
		this.overlayCamera.lookAt(new Vector3(0, 0, 0));

		this.setupDemoScene();
		this.setupOverlayScene();
		this.setupControls();
		this.startAnimationLoop();
	}

	resize(width: number, height: number): void {
		if (!this.renderer || !this.perspectiveCamera || width <= 0 || height <= 0) {
			return;
		}

		this.renderer.setSize(width, height, false);
		this.perspectiveCamera.aspect = width / height;
		this.perspectiveCamera.updateProjectionMatrix();

		if (this.overlayCamera) {
			const aspect = width / height;
			const viewHeight = 1;
			this.overlayCamera.left = -aspect * viewHeight;
			this.overlayCamera.right = aspect * viewHeight;
			this.overlayCamera.top = viewHeight;
			this.overlayCamera.bottom = -viewHeight;
			this.overlayCamera.updateProjectionMatrix();
		}
	}

	dispose(): void {
		if (this.animationHandle !== null && typeof cancelAnimationFrame === 'function') {
			cancelAnimationFrame(this.animationHandle);
		}
		this.animationHandle = null;

		this.controls?.dispose();
		this.controls = null;

		this.disposables.forEach((resource) => {
			try {
				resource.dispose();
			} catch (error) {
				console.warn('[ViewportRenderer] Failed to dispose resource', error);
			}
		});
		this.disposables = [];

		this.renderer?.dispose();
		this.renderer = null;
		this.canvas = null;
		this.demoMesh = null;

		this.mainScene = null;
		this.overlayScene = null;
		this.perspectiveCamera = null;
		this.overlayCamera = null;
	}

	private setupControls(): void {
		if (!this.canvas || !this.perspectiveCamera) {
			return;
		}

		this.controls = new OrbitControls(this.perspectiveCamera, this.canvas);
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.08;
		this.controls.enablePan = true;
		this.controls.minDistance = 1.5;
		this.controls.maxDistance = 50;
		this.controls.target.set(0, 0, 0);
		this.controls.update();
	}

	private setupDemoScene(): void {
		if (!this.mainScene) {
			return;
		}

		const ambientLight = new AmbientLight(0xffffff, 0.6);
		const directionalLight = new DirectionalLight(0xffffff, 0.85);
		directionalLight.position.set(6, 10, 6);
		directionalLight.castShadow = true;

		this.mainScene.add(ambientLight, directionalLight);

		const geometry = new BoxGeometry(1.2, 1.2, 1.2);
		const material = new MeshStandardMaterial({ color: 0x4e8df5, roughness: 0.35, metalness: 0.25 });
		const mesh = new Mesh(geometry, material);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		this.mainScene.add(mesh);
		this.demoMesh = mesh;

		const axes = new AxesHelper(4);
		this.mainScene.add(axes);

		this.disposables.push(geometry, material, axes.geometry, axes.material as LineBasicMaterial);
	}

	private setupOverlayScene(): void {
		if (!this.overlayScene) {
			return;
		}

		const geometry = new BufferGeometry();
		const positions = new Float32BufferAttribute(
			[
				-0.9, 0, 0,
				0.9, 0, 0,
				0, -0.9, 0,
				0, 0.9, 0,
			],
			3,
		);
		geometry.setAttribute('position', positions);

		const material = new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
		const crosshair = new LineSegments(geometry, material);

		this.overlayScene.add(crosshair);
		this.disposables.push(geometry, material);
	}

	private startAnimationLoop(): void {
		if (!this.renderer || !this.mainScene || !this.overlayScene || !this.perspectiveCamera || !this.overlayCamera) {
			return;
		}

		const renderFrame = () => {
			if (!this.renderer || !this.mainScene || !this.overlayScene || !this.perspectiveCamera || !this.overlayCamera) {
				return;
			}

			this.controls?.update();
			if (this.demoMesh) {
				this.demoMesh.rotation.y += 0.01;
				this.demoMesh.rotation.x += 0.005;
			}

			this.renderer!.clear();
			this.renderer!.render(this.mainScene, this.perspectiveCamera);
			this.renderer!.clearDepth();
			this.renderer!.render(this.overlayScene, this.overlayCamera);

			this.animationHandle = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(renderFrame) : null;
		};

		this.animationHandle = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(renderFrame) : null;
	}
}

export type ViewportRenderer = ViewportRendererService;
