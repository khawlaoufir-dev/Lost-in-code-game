import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

export class EnemyController {
    static defaultAnimationUrls = {
        idle: "https://static.seeles.ai/data/asset/export/test/87aa70b9-6623-443f-ae9b-a89cd397b1e1/35629/source.fbx",
        walk: "https://static.seeles.ai/data/asset/export/test/161cf558-31b3-4f27-8524-4b9f75612290/35686/source.fbx",
        run: "https://static.seeles.ai/data/asset/export/test/e950bcb9-411e-43a3-8268-b2b1fa82858b/35704/source.fbx",
        jump: "https://static.seeles.ai/data/asset/export/test/1ce8f3f8-3f22-4f83-b5ce-7c20196694ed/35645/source.fbx",
        attack: "https://static.seeles.ai/data/asset/export/test/1db0cc89-8b31-456d-bad9-18a553c47cc0/35659/source.fbx"
    };

    static animationUrls = { ...EnemyController.defaultAnimationUrls };
    static animationClips = {
        Idle: null,
        Walk: null,
        Run: null,
        Jump: null,
        Attack: null
    };
    static animationLoadPromise = null;

    static setAnimationUrls(urls = {}) {
        EnemyController.animationUrls = {
            ...EnemyController.defaultAnimationUrls,
            ...urls
        };
        EnemyController.animationClips = {
            Idle: null,
            Walk: null,
            Run: null,
            Jump: null,
            Attack: null
        };
        EnemyController.animationLoadPromise = null;
    }

    static async ensureAnimationClips() {
        if (EnemyController.animationLoadPromise) {
            return EnemyController.animationLoadPromise;
        }

        EnemyController.animationLoadPromise = (async () => {
            const loader = new FBXLoader();

            const entries = Object.entries(EnemyController.animationUrls);
            await Promise.all(entries.map(async ([name, url]) => {
                try {
                    const object = await loader.loadAsync(url);
                    if (object.animations && object.animations.length > 0) {
                        const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);
                        EnemyController.animationClips[capitalizedName] = object.animations[0];
                    }
                } catch (error) {
                    console.error(`${name} animation load error:`, error);
                }
            }));

            return EnemyController.animationClips;
        })();

        return EnemyController.animationLoadPromise;
    }

    constructor(model = null) {
        this.model = null;
        this.player = null;
        this.collisionTargets = [];
        this.onAttack = null;
        this.onRangedAttackRequest = null;

        this.mixer = null;
        this.animations = {};
        this.animationClips = {
            Idle: null,
            Walk: null,
            Run: null,
            Jump: null,
            Attack: null
        };
        this.currentAction = null;
        this.currentActionName = '';

        this.state = 'patrol';
        this._prevState = null;
        this.patrolTarget = null;
        this.homePosition = new THREE.Vector3();
        this.velocity = new THREE.Vector3();

        this.patrolRadius = 10;
        this.detectionRange = 8;
        this.attackRange = 2;
        this.attackMode = 'melee';
        this.attackCooldown = 4.0;
        this.attackCooldownTimer = 0;
        this.attackActionTimer = 0;
        this.attackQueuedCooldown = false;
        this.speed = 2;
        this.gravity = -20;

        this._groundRaycaster = new THREE.Raycaster();
        this._wallRaycaster = new THREE.Raycaster();

        this.setModel(model);
    }

    async init({ skipAnimation = false } = {}) {
        if (!skipAnimation) {
            await EnemyController.ensureAnimationClips();
            this.bindAnimationClips();
        }
        if (!this.currentAction) {
            this.playEnemyAnimation('Walk');
        }
    }

    setPlayer(player) {
        this.player = player;
    }

    setModel(model) {
        this.model = model || null;
        this.mixer = this.model ? new THREE.AnimationMixer(this.model) : null;
        this.animations = {};
        this.currentAction = null;
        this.currentActionName = '';
        this.patrolTarget = null;
        this._prevState = null;
        this.velocity.set(0, 0, 0);
        this.homePosition = this.model ? this.model.position.clone() : new THREE.Vector3();

        if (this.model) {
            this.bindAnimationClips();
            this.setNewPatrolTarget();
        }
    }

    getState() {
        return {
            state: this.state,
            attackMode: this.attackMode,
            hasModel: Boolean(this.model),
            hasPlayer: Boolean(this.player),
            patrolTarget: this.patrolTarget ? this.patrolTarget.clone() : null,
            homePosition: this.homePosition.clone(),
            position: this.model ? this.model.position.clone() : null,
            velocity: this.velocity.clone(),
            distanceToPlayer: this.model && this.player ? this.model.position.distanceTo(this.player.position) : null,
            attackCooldownRemaining: this.attackCooldownTimer,
            attackActionRemaining: this.attackActionTimer
        };
    }

    reset({ position = null, rotationY = null, keepHomePosition = false } = {}) {
        if (!this.model) return;

        if (position) {
            this.model.position.copy(position);
        } else {
            this.model.position.copy(this.homePosition);
        }

        if (rotationY !== null && rotationY !== undefined) {
            const nextRotation = Number(rotationY);
            if (Number.isFinite(nextRotation)) {
                this.model.rotation.y = nextRotation;
            }
        }

        if (!keepHomePosition) {
            this.homePosition.copy(this.model.position);
        }

        this.state = 'patrol';
        this._prevState = null;
        this.velocity.set(0, 0, 0);
        this.attackCooldownTimer = 0;
        this.attackActionTimer = 0;
        this.attackQueuedCooldown = false;
        this.patrolTarget = null;
        this.setNewPatrolTarget();
        this.playEnemyAnimation('Walk') || this.playEnemyAnimation('Idle');
    }

    setAttackCallback(callback) {
        this.onAttack = typeof callback === 'function' ? callback : null;
    }

    setRangedAttackCallback(callback) {
        this.onRangedAttackRequest = typeof callback === 'function' ? callback : null;
    }

    setAttackMode(mode) {
        if (mode === 'melee' || mode === 'ranged') {
            this.attackMode = mode;
        }
    }

    setAnimationClips(clips = {}, { rebind = true } = {}) {
        if (!clips || typeof clips !== 'object') return;

        const getClip = (name) => {
            if (Object.prototype.hasOwnProperty.call(clips, name)) return clips[name];
            const lowerName = name.toLowerCase();
            if (Object.prototype.hasOwnProperty.call(clips, lowerName)) return clips[lowerName];
            return undefined;
        };

        ['Idle', 'Walk', 'Run', 'Jump', 'Attack'].forEach((name) => {
            const clip = getClip(name);
            if (clip !== undefined) {
                this.animationClips[name] = clip || null;
            }
        });

        if (rebind && this.model) {
            this.bindAnimationClips();
        }
    }

    setCollisionTarget(target) {
        this.setCollisionTargets(target ? [target] : []);
    }

    setCollisionTargets(targets = []) {
        if (!Array.isArray(targets)) {
            this.collisionTargets = [];
            return;
        }

        this.collisionTargets = targets.filter(Boolean);
    }

    removeCollisionTarget(target) {
        if (!target) return;
        this.collisionTargets = this.collisionTargets.filter((item) => item !== target);
    }

    removeCollisionTargets(targets = []) {
        if (!Array.isArray(targets) || targets.length === 0) return;
        const targetSet = new Set(targets.filter(Boolean));
        this.collisionTargets = this.collisionTargets.filter((item) => !targetSet.has(item));
    }

    setPatrolRadius(value) {
        const next = Number(value);
        if (Number.isFinite(next)) {
            this.patrolRadius = next;
        }
    }

    setDetectionRange(value) {
        const next = Number(value);
        if (Number.isFinite(next)) {
            this.detectionRange = next;
        }
    }

    setAttackRange(value) {
        const next = Number(value);
        if (Number.isFinite(next)) {
            this.attackRange = next;
        }
    }

    setAttackCooldown(value) {
        const next = Number(value);
        if (Number.isFinite(next) && next >= 0) {
            this.attackCooldown = next;
        }
    }

    getAttackAnimationDuration() {
        const attackAction = this.animations.Attack || this.animations.attack || this.animations.Punch || this.animations.punch;
        if (attackAction && attackAction.getClip) {
            const clip = attackAction.getClip();
            if (clip && Number.isFinite(clip.duration) && clip.duration > 0) {
                return clip.duration;
            }
        }
        return 0.6;
    }

    setSpeed(value) {
        const next = Number(value);
        if (Number.isFinite(next)) {
            this.speed = next;
        }
    }

    setGravity(value) {
        const next = Number(value);
        if (Number.isFinite(next)) {
            this.gravity = next;
        }
    }

    bindAnimationClips() {
        if (!this.mixer) return;

        this.animations = {};

        const sourceClips = {
            Idle: this.animationClips.Idle || EnemyController.animationClips.Idle,
            Walk: this.animationClips.Walk || EnemyController.animationClips.Walk,
            Run: this.animationClips.Run || EnemyController.animationClips.Run,
            Jump: this.animationClips.Jump || EnemyController.animationClips.Jump,
            Attack: this.animationClips.Attack || EnemyController.animationClips.Attack
        };

        Object.entries(sourceClips).forEach(([name, clip]) => {
            if (!clip) return;
            const action = this.mixer.clipAction(clip);
            this.animations[name] = action;
            this.animations[name.toLowerCase()] = action;
        });
    }

    setNewPatrolTarget() {
        if (!this.model) return;

        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * this.patrolRadius;
        this.patrolTarget = new THREE.Vector3(
            this.homePosition.x + Math.cos(angle) * distance,
            this.model.position.y,
            this.homePosition.z + Math.sin(angle) * distance
        );
    }

    playEnemyAnimation(name) {
        const newAction = this.animations[name] || this.animations[name.toLowerCase()];
        if (!newAction) return false;
        const actionName = String(name).toLowerCase();
        // 攻击和跳跃都是单次播放动画
        const isOneShot = actionName === 'attack' || actionName === 'punch' || actionName === 'jump';

        if (isOneShot) {
            newAction.setLoop(THREE.LoopOnce, 1);
            newAction.clampWhenFinished = true;
        } else {
            newAction.setLoop(THREE.LoopRepeat, Infinity);
            newAction.clampWhenFinished = false;
        }

        if (this.currentAction === newAction) {
            if (!newAction.isRunning()) {
                newAction.reset().fadeIn(0.15).play();
            }
            this.currentActionName = actionName;
            return true;
        }

        if (this.currentAction) {
            newAction
                .reset()
                .setEffectiveWeight(1)
                .crossFadeFrom(this.currentAction, 0.18, true)
                .play();
        } else {
            newAction.reset().fadeIn(0.18).play();
        }

        this.currentAction = newAction;
        this.currentActionName = actionName;
        return true;
    }

    checkGroundCollision() {
        if (!this.model || this.collisionTargets.length === 0) return false;

        const origin = this.model.position.clone();
        origin.y += 0.5;
        this._groundRaycaster.set(origin, new THREE.Vector3(0, -1, 0));

        const intersects = this._groundRaycaster.intersectObjects(this.collisionTargets, true);

        if (intersects.length > 0) {
            const distance = intersects[0].distance - 0.5;
            if (distance < 0.1) {
                this.model.position.y = intersects[0].point.y;
                return true;
            }
        }

        return false;
    }

    checkWallCollision(direction) {
        if (!this.model || this.collisionTargets.length === 0) return false;

        const origin = this.model.position.clone();
        origin.y += 1;

        this._wallRaycaster.set(origin, direction.clone().normalize());
        const intersects = this._wallRaycaster.intersectObjects(this.collisionTargets, true);

        return intersects.length > 0 && intersects[0].distance < 0.5;
    }

    update(delta) {
        if (!this.model || !this.player) return;

        this.attackCooldownTimer = Math.max(0, this.attackCooldownTimer - delta);
        this.attackActionTimer = Math.max(0, this.attackActionTimer - delta);

        if (this.attackQueuedCooldown && this.attackActionTimer <= 0) {
            this.attackCooldownTimer = this.attackCooldown;
            this.attackQueuedCooldown = false;
        }

        if (this.mixer) this.mixer.update(delta);

        const isCurrentActionRunning = Boolean(this.currentAction && this.currentAction.isRunning());
        const distanceToPlayer = this.model.position.distanceTo(this.player.position);

        if (distanceToPlayer < this.attackRange) {
            this._prevState = this.state;
            this.state = 'attack';

            if (this.attackCooldownTimer <= 0 && this.attackActionTimer <= 0) {
                const attackDuration = this.getAttackAnimationDuration();
                this.playEnemyAnimation('Attack') || this.playEnemyAnimation('Punch') || this.playEnemyAnimation('Walk');
                if (this.attackMode === 'ranged') {
                    if (this.onRangedAttackRequest) {
                        this.onRangedAttackRequest({
                            enemy: this.model,
                            controller: this,
                            distanceToPlayer
                        });
                    }
                } else if (this.onAttack) {
                    this.onAttack({
                        enemy: this.model,
                        player: this.player,
                        controller: this,
                        distanceToPlayer
                    });
                }
                this.attackActionTimer = attackDuration;
                this.attackQueuedCooldown = true;
            } else if (this.attackActionTimer <= 0) {
                this.playEnemyAnimation('Idle') || this.playEnemyAnimation('Walk');
            }

            const dx = this.player.position.x - this.model.position.x;
            const dz = this.player.position.z - this.model.position.z;
            this.model.rotation.y = Math.atan2(dx, dz);
        } else if (distanceToPlayer < this.detectionRange) {
            if (this.state !== 'chase') {
                this._prevState = this.state;
                this.state = 'chase';
            }
            if (!isCurrentActionRunning || this.currentActionName !== 'run') {
                this.playEnemyAnimation('Run') || this.playEnemyAnimation('Walk');
            }

            const direction = new THREE.Vector3()
                .subVectors(this.player.position, this.model.position)
                .normalize();

            const newPosX = this.model.position.x + direction.x * this.speed * delta;
            const newPosZ = this.model.position.z + direction.z * this.speed * delta;

            if (!this.checkWallCollision(direction)) {
                this.model.position.x = newPosX;
                this.model.position.z = newPosZ;
            }

            this.model.rotation.y = Math.atan2(direction.x, direction.z);
        } else {
            if (this.state !== 'patrol') {
                this._prevState = this.state;
                this.state = 'patrol';
            }

            if (!isCurrentActionRunning || this.currentActionName !== 'walk') {
                this.playEnemyAnimation('Walk');
            }

            if (this.patrolTarget) {
                const distToTarget = this.model.position.distanceTo(this.patrolTarget);

                if (distToTarget < 1) {
                    this.setNewPatrolTarget();
                } else {
                    const direction = new THREE.Vector3()
                        .subVectors(this.patrolTarget, this.model.position)
                        .normalize();

                    const newPosX = this.model.position.x + direction.x * this.speed * 0.5 * delta;
                    const newPosZ = this.model.position.z + direction.z * this.speed * 0.5 * delta;

                    if (!this.checkWallCollision(direction)) {
                        this.model.position.x = newPosX;
                        this.model.position.z = newPosZ;
                    }

                    this.model.rotation.y = Math.atan2(direction.x, direction.z);
                }
            }
        }

        this.velocity.y += this.gravity * delta;
        this.model.position.y += this.velocity.y * delta;

        if (this.checkGroundCollision()) {
            this.velocity.y = 0;
        }

        if (this.model.position.y < -20) {
            this.model.position.copy(this.homePosition);
            this.velocity.y = 0;
        }
    }

    destroy() {
        if (this.mixer) {
            this.mixer.stopAllAction();
            this.mixer = null;
        }
        this.animations = {};
        this.currentAction = null;
        this.collisionTargets = [];
        this.player = null;
        this.model = null;
    }
}