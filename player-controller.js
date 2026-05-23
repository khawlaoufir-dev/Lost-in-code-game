import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as THREE from 'three';

export class PlayerController {
    constructor(character = null) {
        this.collisionTargets = [];
        this.character = null;
        this.getCameraYaw = null;
        this.cameraYaw = 0;

        this.moveSpeed = 3;
        this.jumpSpeed = 8;
        this.gravity = -20;

        this.wallCheckDistance = 0.5;
        this.groundProbeHeight = 0.5;
        this.groundSnapDistance = 0.1;
        this.fallResetY = -20;
        this.fallResetPosition = new THREE.Vector3(0, 10, 0);

        this.inputTarget = document;
        this.enableKeyboard = true;
        this.enableJoystick = true;
        this.joystickDeadZone = 0.12;
        this.isConnected = false;

        this.keys = {
            w: false,
            a: false,
            s: false,
            d: false,
            space: false,
            shift: false,
            f: false
        };
        this.pressedKeys = new Set();
        this.keyBindings = {
            forward: ['w'],
            backward: ['s'],
            left: ['a'],
            right: ['d'],
            jump: ['space'],
            sprint: ['shift'],
            attack: ['f']
        };

        this.joystick = {
            moveX: 0,
            moveZ: 0,
            jumpPressed: false,
            sprintPressed: false,
            attackPressed: false
        };

        this.attackJustPressed = false;
        this.isAttacking = false;
        this.onAttack = null;

        this.velocity = new THREE.Vector3();
        this.isOnGround = false;
        this.animationActions = {
            idle: null,
            walk: null,
            run: null,
            jump: null,
            attack: null
        };
        this.animationClips = {
            idle: null,
            walk: null,
            run: null,
            jump: null,
            attack: null
        };
        this.currentAction = null;
        this.animationFadeDuration = 0.2;
        this.animationMixer = null;
        this.defaultAnimationUrls = {
            idle: "https://static.seeles.ai/data/asset/export/test/87aa70b9-6623-443f-ae9b-a89cd397b1e1/35629/source.fbx",
            walk: "https://static.seeles.ai/data/asset/export/test/161cf558-31b3-4f27-8524-4b9f75612290/35686/source.fbx",
            run: "https://static.seeles.ai/data/asset/export/test/e950bcb9-411e-43a3-8268-b2b1fa82858b/35704/source.fbx",
            jump: "https://static.seeles.ai/data/asset/export/test/1ce8f3f8-3f22-4f83-b5ce-7c20196694ed/35645/source.fbx",
            attack: "https://static.seeles.ai/data/asset/export/test/1db0cc89-8b31-456d-bad9-18a553c47cc0/35659/source.fbx"
        };

        this.groundRaycaster = new THREE.Raycaster();
        this.wallRaycaster = new THREE.Raycaster();
        this.tmpInputDirection = new THREE.Vector3();
        this.tmpWorldDirection = new THREE.Vector3();
        this.downDirection = new THREE.Vector3(0, -1, 0);

        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);

        this.setCharacter(character);
    }

    get object() {
        return this.character;
    }

    setCameraYawGetter(getter) {
        this.getCameraYaw = getter;
    }

    setMoveSpeed(value) {
        this.moveSpeed = Number(value);
    }

    setJumpSpeed(value) {
        this.jumpSpeed = Number(value);
    }

    setGravity(value) {
        this.gravity = Number(value);
    }

    setCollisionConfig({ wallCheckDistance, groundProbeHeight, groundSnapDistance } = {}) {
        if (wallCheckDistance !== undefined) this.wallCheckDistance = Number(wallCheckDistance);
        if (groundProbeHeight !== undefined) this.groundProbeHeight = Number(groundProbeHeight);
        if (groundSnapDistance !== undefined) this.groundSnapDistance = Number(groundSnapDistance);
    }

    setFallReset({ y, position } = {}) {
        if (y !== undefined) this.fallResetY = Number(y);
        if (position) this.fallResetPosition.copy(position);
    }

    setAnimationUrls(urls = {}) {
        Object.assign(this.defaultAnimationUrls, urls);
    }

    setAttackCallback(callback) {
        this.onAttack = typeof callback === 'function' ? callback : null;
    }

    setInputConfig({
        inputTarget,
        enableKeyboard,
        enableJoystick,
        joystickDeadZone
    } = {}) {
        const wasConnected = this.isConnected;
        if (wasConnected) this.disconnect();

        if (inputTarget !== undefined) this.inputTarget = inputTarget;
        if (enableKeyboard !== undefined) this.enableKeyboard = Boolean(enableKeyboard);
        if (enableJoystick !== undefined) this.enableJoystick = Boolean(enableJoystick);
        if (joystickDeadZone !== undefined) this.joystickDeadZone = Number(joystickDeadZone);

        if (wasConnected) this.connect();
    }

    normalizeKeyName(key) {
        if (key === ' ') return 'space';
        return String(key).toLowerCase();
    }

    normalizeKeyList(keys) {
        if (keys === undefined || keys === null) return [];
        const list = Array.isArray(keys) ? keys : [keys];
        return list.map((key) => this.normalizeKeyName(key));
    }

    setKeyBindings({ forward, backward, left, right, jump, sprint, attack } = {}) {
        if (forward !== undefined) this.keyBindings.forward = this.normalizeKeyList(forward);
        if (backward !== undefined) this.keyBindings.backward = this.normalizeKeyList(backward);
        if (left !== undefined) this.keyBindings.left = this.normalizeKeyList(left);
        if (right !== undefined) this.keyBindings.right = this.normalizeKeyList(right);
        if (jump !== undefined) this.keyBindings.jump = this.normalizeKeyList(jump);
        if (sprint !== undefined) this.keyBindings.sprint = this.normalizeKeyList(sprint);
        if (attack !== undefined) this.keyBindings.attack = this.normalizeKeyList(attack);
        this.syncKeyboardState();
    }

    syncKeyboardState() {
        this.keys.w = this.keyBindings.forward.some((key) => this.pressedKeys.has(key));
        this.keys.a = this.keyBindings.left.some((key) => this.pressedKeys.has(key));
        this.keys.s = this.keyBindings.backward.some((key) => this.pressedKeys.has(key));
        this.keys.d = this.keyBindings.right.some((key) => this.pressedKeys.has(key));
        this.keys.space = this.keyBindings.jump.some((key) => this.pressedKeys.has(key));
        this.keys.shift = this.keyBindings.sprint.some((key) => this.pressedKeys.has(key));
        this.keys.f = this.keyBindings.attack.some((key) => this.pressedKeys.has(key));
    }

    connect() {
        if (this.isConnected) return;

        if (this.enableKeyboard && this.inputTarget) {
            this.inputTarget.addEventListener('keydown', this.onKeyDown);
            this.inputTarget.addEventListener('keyup', this.onKeyUp);
        }

        this.isConnected = true;
    }

    disconnect() {
        if (!this.isConnected) return;

        if (this.enableKeyboard && this.inputTarget) {
            this.inputTarget.removeEventListener('keydown', this.onKeyDown);
            this.inputTarget.removeEventListener('keyup', this.onKeyUp);
        }

        this.pressedKeys.clear();
        this.syncKeyboardState();

        this.isConnected = false;
    }

    onKeyDown(event) {
        const key = this.normalizeKeyName(event.key);
        if (!this.pressedKeys.has(key)) {
            const attackKeys = this.keyBindings.attack || [];
            if (attackKeys.includes(key)) {
                this.attackJustPressed = true;
            }
        }
        this.pressedKeys.add(key);
        this.syncKeyboardState();
    }

    onKeyUp(event) {
        const key = this.normalizeKeyName(event.key);
        this.pressedKeys.delete(key);
        this.syncKeyboardState();
    }

    setJoystickMove(moveX = 0, moveZ = 0) {
        const rawX = Number(moveX);
        const rawZ = Number(moveZ);
        const clampedX = Number.isFinite(rawX) ? Math.max(-1, Math.min(1, rawX)) : 0;
        const clampedZ = Number.isFinite(rawZ) ? Math.max(-1, Math.min(1, rawZ)) : 0;

        const length = Math.hypot(clampedX, clampedZ);
        if (length < this.joystickDeadZone) {
            this.joystick.moveX = 0;
            this.joystick.moveZ = 0;
            return;
        }

        if (length > 1) {
            this.joystick.moveX = clampedX / length;
            this.joystick.moveZ = clampedZ / length;
            return;
        }

        this.joystick.moveX = clampedX;
        this.joystick.moveZ = clampedZ;
    }

    setJoystickJump(isPressed) {
        this.joystick.jumpPressed = Boolean(isPressed);
    }

    setJoystickSprint(isPressed) {
        this.joystick.sprintPressed = Boolean(isPressed);
    }

    setJoystickAttack(isPressed) {
        const pressed = Boolean(isPressed);
        if (pressed && !this.joystick.attackPressed) {
            this.attackJustPressed = true;
        }
        this.joystick.attackPressed = pressed;
    }

    resetJoystickInput() {
        this.joystick.moveX = 0;
        this.joystick.moveZ = 0;
        this.joystick.jumpPressed = false;
        this.joystick.sprintPressed = false;
        this.joystick.attackPressed = false;
    }

    getInputIntent() {
        const keyboardX = (this.keys.d ? 1 : 0) + (this.keys.a ? -1 : 0);
        const keyboardZ = (this.keys.s ? 1 : 0) + (this.keys.w ? -1 : 0);
        const joystickX = this.enableJoystick ? this.joystick.moveX : 0;
        const joystickZ = this.enableJoystick ? this.joystick.moveZ : 0;
        const joystickJump = this.enableJoystick ? this.joystick.jumpPressed : false;
        const moveX = Math.max(-1, Math.min(1, keyboardX + joystickX));
        const moveZ = Math.max(-1, Math.min(1, keyboardZ + joystickZ));

        const joystickMagnitude = Math.hypot(joystickX, joystickZ);
        const joystickSprint = this.enableJoystick && (this.joystick.sprintPressed || joystickMagnitude > 0.7);

        const attack = this.attackJustPressed;
        this.attackJustPressed = false;

        return {
            moveX,
            moveZ,
            jump: this.keys.space || joystickJump,
            sprint: this.keys.shift || joystickSprint,
            attack
        };
    }

    setCollisionTargets(targets = []) {
        if (!Array.isArray(targets)) {
            this.collisionTargets = [];
            return;
        }

        this.collisionTargets = targets.filter(Boolean);
    }

    addCollisionTarget(target) {
        if (!target) return;
        if (!this.collisionTargets.includes(target)) {
            this.collisionTargets.push(target);
        }
    }

    removeCollisionTarget(target) {
        if (!target) return;
        this.collisionTargets = this.collisionTargets.filter((item) => item !== target);
    }

    clearCollisionTargets() {
        this.collisionTargets = [];
    }

    setCharacter(character) {
        this.character = character;
        this.animationMixer = character ? new THREE.AnimationMixer(character) : null;
        this.currentAction = null;
        this.rebuildAnimationActions();

        if (character && !this.isConnected) {
            this.connect();
        }
    }

    getState() {
        return {
            hasCharacter: Boolean(this.character),
            isOnGround: this.isOnGround,
            velocity: this.velocity.clone(),
            position: this.character ? this.character.position.clone() : null,
            rotationY: this.character ? this.character.rotation.y : null,
            moveSpeed: this.moveSpeed,
            jumpSpeed: this.jumpSpeed,
            gravity: this.gravity
        };
    }

    reset({ position = null, rotationY = null, keepVelocity = false } = {}) {
        if (!this.character) return;

        if (position) {
            this.character.position.copy(position);
        } else {
            this.character.position.copy(this.fallResetPosition);
        }

        if (rotationY !== null && rotationY !== undefined) {
            const nextRotation = Number(rotationY);
            if (Number.isFinite(nextRotation)) {
                this.character.rotation.y = nextRotation;
            }
        }

        if (!keepVelocity) {
            this.velocity.set(0, 0, 0);
        }

        this.isOnGround = false;
        this.isAttacking = false;
        this.attackJustPressed = false;
        this.pressedKeys.clear();
        this.syncKeyboardState();
        this.resetJoystickInput();

        if (this.animationActions.idle) {
            this.playManagedAnimation(this.animationActions.idle);
        }
    }

    async init({ skipAnimation = false } = {}) {
        if (skipAnimation) {
            return {
                mixer: this.animationMixer,
                animations: this.animationActions
            };
        }

        const loader = new FBXLoader();

        this.animationClips = {
            idle: null,
            walk: null,
            run: null,
            jump: null,
            attack: null
        };

        const entries = Object.entries(this.defaultAnimationUrls);

        await Promise.all(entries.map(async ([name, url]) => {
            try {
                const object = await loader.loadAsync(url);
                if (!object.animations || object.animations.length === 0) return;
                const lowerName = name.toLowerCase();
                if (lowerName in this.animationClips) {
                    this.animationClips[lowerName] = object.animations[0];
                }
            } catch (error) {
                console.error(`${name} animation load error:`, error);
            }
        }));

        this.rebuildAnimationActions();

        if (this.animationActions.idle) {
            this.playManagedAnimation(this.animationActions.idle);
        }

        return {
            mixer: this.animationMixer,
            animations: this.animationActions
        };
    }

    setCameraYaw(yaw) {
        this.cameraYaw = yaw;
    }

    setAnimationActions(actions = {}) {
        this.animationActions.idle = actions.Idle || actions.idle || null;
        this.animationActions.walk = actions.Walk || actions.walk || null;
        this.animationActions.run = actions.Run || actions.run || null;
        this.animationActions.jump = actions.Jump || actions.jump || null;
        this.animationActions.attack = actions.Attack || actions.attack || null;

        if (this.animationActions.jump) {
            this.animationActions.jump.clampWhenFinished = true;
            this.animationActions.jump.setLoop(THREE.LoopOnce, 1);
        }
        if (this.animationActions.attack) {
            this.animationActions.attack.clampWhenFinished = true;
            this.animationActions.attack.setLoop(THREE.LoopOnce, 1);
        }
    }

    setAnimationClips(clips = {}, { rebuild = true, autoplayIdle = false } = {}) {
        if (!clips || typeof clips !== 'object') return;

        ['idle', 'walk', 'run', 'jump', 'attack'].forEach((lowerKey) => {
            const upperKey = lowerKey.charAt(0).toUpperCase() + lowerKey.slice(1);
            if (Object.prototype.hasOwnProperty.call(clips, upperKey)) {
                this.animationClips[lowerKey] = clips[upperKey] || null;
            } else if (Object.prototype.hasOwnProperty.call(clips, lowerKey)) {
                this.animationClips[lowerKey] = clips[lowerKey] || null;
            }
        });

        if (!rebuild) return;

        this.rebuildAnimationActions();
        if (autoplayIdle && this.animationActions.idle) {
            this.playManagedAnimation(this.animationActions.idle);
        }
    }

    rebuildAnimationActions() {
        this.animationActions.idle = null;
        this.animationActions.walk = null;
        this.animationActions.run = null;
        this.animationActions.jump = null;
        this.animationActions.attack = null;

        if (!this.animationMixer || !this.animationClips) return;

        if (this.animationClips.idle) {
            this.animationActions.idle = this.animationMixer.clipAction(this.animationClips.idle);
        }
        if (this.animationClips.walk) {
            this.animationActions.walk = this.animationMixer.clipAction(this.animationClips.walk);
        }
        if (this.animationClips.run) {
            this.animationActions.run = this.animationMixer.clipAction(this.animationClips.run);
        }
        if (this.animationClips.jump) {
            this.animationActions.jump = this.animationMixer.clipAction(this.animationClips.jump);
            this.animationActions.jump.clampWhenFinished = true;
            this.animationActions.jump.setLoop(THREE.LoopOnce, 1);
        }
        if (this.animationClips.attack) {
            this.animationActions.attack = this.animationMixer.clipAction(this.animationClips.attack);
            this.animationActions.attack.clampWhenFinished = true;
            this.animationActions.attack.setLoop(THREE.LoopOnce, 1);
        }
    }

    playManagedAnimation(action) {
        if (!action) return;
        if (this.currentAction === action) return;

        if (this.currentAction) {
            this.currentAction.fadeOut(this.animationFadeDuration);
        }

        action.reset().fadeIn(this.animationFadeDuration).play();
        this.currentAction = action;
    }

    updateManagedAnimation(delta, state) {
        const { idle, walk, run, jump, attack } = this.animationActions;

        if (this.isAttacking && attack && !attack.isRunning()) {
            this.isAttacking = false;
        }

        if (!this.isAttacking) {
            if (state.didJump && jump) {
                this.playManagedAnimation(jump);
            } else if (state.isOnGround) {
                if (state.isMoving) {
                    if (state.isSprinting && run) {
                        this.playManagedAnimation(run);
                    } else if (walk) {
                        this.playManagedAnimation(walk);
                    } else if (run) {
                        this.playManagedAnimation(run);
                    }
                } else if (idle) {
                    this.playManagedAnimation(idle);
                }
            }
        }

        if (this.animationMixer) {
            this.animationMixer.update(delta);
        }
    }

    checkGroundCollision(model = this.character) {
        if (!model || this.collisionTargets.length === 0) return false;

        const origin = model.position.clone();
        origin.y += this.groundProbeHeight;

        this.groundRaycaster.set(origin, this.downDirection);
        const intersects = this.groundRaycaster.intersectObjects(this.collisionTargets, true);

        if (intersects.length > 0) {
            const distance = intersects[0].distance - this.groundProbeHeight;
            if (distance < this.groundSnapDistance) {
                model.position.y = intersects[0].point.y;
                return true;
            }
        }

        return false;
    }

    checkWallCollision(direction, position = this.character ? this.character.position : null) {
        if (this.collisionTargets.length === 0 || !position || direction.lengthSq() === 0) return false;

        const origin = position.clone();
        origin.y += 1;

        this.wallRaycaster.set(origin, direction.clone().normalize());
        const intersects = this.wallRaycaster.intersectObjects(this.collisionTargets, true);

        return intersects.length > 0 && intersects[0].distance < this.wallCheckDistance;
    }

    update(delta, intent = null) {
        if (!this.character) {
            return { isMoving: false, isOnGround: false, didJump: false };
        }

        this.velocity.y += this.gravity * delta;

        const resolvedIntent = intent || this.getInputIntent();

        const moveX = Number(resolvedIntent.moveX || 0);
        const moveZ = Number(resolvedIntent.moveZ || 0);
        const jump = Boolean(resolvedIntent.jump);
        const sprint = Boolean(resolvedIntent.sprint);
        const attackTriggered = Boolean(resolvedIntent.attack);
        const yaw = resolvedIntent.yaw !== undefined
            ? Number(resolvedIntent.yaw)
            : (this.getCameraYaw ? this.getCameraYaw() : this.cameraYaw);

        if (attackTriggered && !this.isAttacking && this.animationActions.attack) {
            this.isAttacking = true;
            this.playManagedAnimation(this.animationActions.attack);
            if (this.onAttack) {
                this.onAttack({ character: this.character, controller: this });
            }
        }

        this.tmpInputDirection.set(0, 0, 0);
        this.tmpInputDirection.x = moveX;
        this.tmpInputDirection.z = moveZ;

        const isMoving = this.tmpInputDirection.lengthSq() > 0;

        if (isMoving) {
            if (this.tmpInputDirection.lengthSq() > 1) {
                this.tmpInputDirection.normalize();
            }

            const angle = -yaw;
            this.tmpWorldDirection.x = this.tmpInputDirection.x * Math.cos(angle) - this.tmpInputDirection.z * Math.sin(angle);
            this.tmpWorldDirection.z = this.tmpInputDirection.x * Math.sin(angle) + this.tmpInputDirection.z * Math.cos(angle);

            const nextPosX = this.character.position.x + this.tmpWorldDirection.x * this.moveSpeed * delta;
            const nextPosZ = this.character.position.z + this.tmpWorldDirection.z * this.moveSpeed * delta;

            if (!this.checkWallCollision(this.tmpWorldDirection)) {
                this.character.position.x = nextPosX;
                this.character.position.z = nextPosZ;
            }

            this.character.rotation.y = Math.atan2(this.tmpWorldDirection.x, this.tmpWorldDirection.z);
        }

        let didJump = false;
        if (jump && this.isOnGround) {
            this.velocity.y = this.jumpSpeed;
            this.isOnGround = false;
            didJump = true;
        }

        this.character.position.y += this.velocity.y * delta;

        this.isOnGround = this.checkGroundCollision();
        if (this.isOnGround) {
            this.velocity.y = 0;
        }

        if (this.character.position.y < this.fallResetY) {
            this.character.position.copy(this.fallResetPosition);
            this.velocity.y = 0;
            this.isOnGround = false;
        }

        const state = {
            isMoving,
            isOnGround: this.isOnGround,
            didJump,
            isSprinting: sprint
        };

        this.updateManagedAnimation(delta, state);

        return state;
    }

    destroy() {
        this.disconnect();
        if (this.animationMixer) {
            this.animationMixer.stopAllAction();
            this.animationMixer = null;
        }
        this.collisionTargets = [];
        this.character = null;
    }
}