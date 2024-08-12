class Story {

    constructor(json) {
        this.data = json;
        this.settings = json.settings;
        this.scenes = json.scenes;
        this.manifest = toManifest(json);

    }

    async load() {
        console.log('Manifest: ', this.manifest);
        window.resizeTo(1024, 1024);

        PIXI.Assets.addBundle('story', this.manifest);
        this.resources = await PIXI.Assets.loadBundle('story');

        // Create the application helper and add its render target to the page
        this.app = new PIXI.Application();
        await this.app.init({width: 1024, height: 1024});
        document.body.appendChild(this.app.canvas);

        let sprite = PIXI.Sprite.from(this.resources[this.data.splash.image]);
        this.app.stage.addChild(sprite);
        this.resources[this.data.splash.sound].play(() => {
            console.log('Sound finished playing');
            const scene = new Scene(this, this.data.start);
            scene.render();
        });
    }

}

class Scene {

    constructor(story, id) {
        this.app = story.app;
        this.scene = story.scenes[id];
        this.background = this.scene.background;
        this.resources = story.resources;
        this.characters = [];
        this.scene.objects.forEach((obj) => {
            this.characters.push(new Character(story, obj));
        });

    }

    render() {
        this.playSound();
        this.drawBackground();
        this.onShowCharacters();
    }

    drawBackground() {
        const background = this.resources[this.background];
        this.sprite = PIXI.Sprite.from(background);
        this.sprite.alpha = 1;
        this.app.stage.addChild(this.sprite);
    }

    onShowCharacters() {
        this.characters.forEach((character) => {
            character.onShow();
        });
        setInterval(() => {
            this.characters.filter((character) => {
                if (character.name === 'Fly') {
                    character.onShow();
                }
            })
        }, 2000);
    }

    playSound() {
        const sounds = this.scene.sounds;
        if (sounds && sounds.length) {
            sounds.forEach((meta) => {
                if (meta.wait_in_ms !== undefined) {
                    this.play(meta);
                }
            })

        }
    }

    play(meta) {
        const sound = this.resources[meta.file];
        sound.volume = meta.volume;
        setTimeout(() => {
            if (meta.next) {
                sound.play(() => this.onComplete(meta));
            } else {
                sound.play();
            }
        }, meta.wait_in_ms);
    }

    onComplete(meta) {
        if (meta.next) {
            const sounds = this.scene.sounds;
            sounds.forEach((sound) => {
                if (sound.id === meta.next) {
                    this.play(sound);
                }
            });
        }
    }

}

class Character {

    constructor(story, data) {
        this.story = story;
        this.data = data;
        this.settings = data.settings;
        this.app = story.app;
        this.name = data.name;
        this.image = data.image;
        this.position = data.position;
        this.resources = story.resources;
        this.onLoadChain = [];
    }

    onShow() {
        const image = this.resources[this.image];
        this.sprite = PIXI.Sprite.from(image);
        this.sprite.position.x = this.position.x1;
        this.sprite.position.y = this.position.y1;
        if (this.data.settings) {
            const settings = this.data.settings;
            const scale = settings.scale;
            if (scale) {
                this.sprite.scale.set(scale.height, scale.width);
            }
            if (this.settings.flip) {
                this.sprite.width *= -1;
            }
        }
        this.configureActions();
        this.app.stage.addChild(this.sprite);
        this.dropFromSky();
        this.onLoadChain.forEach((effect) => {
            effect.execute();
        });
    }

    dropFromSky() {
        if (!this.settings.gravity) {
            return;
        }
        console.log('configuring gravity...');
        this.sprite.vy = 0;
        this.app.ticker.add(() => {
            this.sprite.vy += this.settings.gravity;
            this.sprite.y += this.sprite.vy;
            if (this.sprite.y > this.app.screen.height - this.sprite.height) {
                this.sprite.y = this.app.screen.height - this.sprite.height;
                this.sprite.vy = 0; // Stop the sprite when it hits the ground
            }
        });
    }

    configureActions() {
        const actions = this.data.actions;
        if (actions) {
            Object.entries(actions)
                .forEach((property) => {
                    const action = property[0];
                    const meta = property[1];
                    if (action === 'touch') {
                        this.setupOnTouch(meta.effects);
                    } else if (action === 'onload') {
                        this.onLoadChain = meta.effects.map((effect) => {
                            console.log(`Creating new effect ${effect.name}`);
                            if (effect.name === 'audio') {
                                return new AudioEffect(this.app, this.sprite, this.resources, effect);
                            }
                            if (effect.name === 'move') {
                                return new MoveEffect(this.app, this.sprite, this.resources, effect);
                            }
                            if (effect.name === 'bounce') {
                                return new BounceEffect(this.app, this.sprite, this.resources, effect);
                            }
                            if (effect.name === 'transition') {
                                return new TransitionEffect(this.app, this.sprite, this.resources, effect);
                            }
                            if (effect.name === 'fade_out') {
                                return new FadeOutEffect(this.app, this.sprite, this.resources, effect);
                            }
                            if (effect.name === 'spin') {
                                return new SpinEffect(this.app, this.sprite, this.resources, effect);
                            }
                            console.warn(`No effect found for ${effect.name}`);
                        });
                    }
                });
        }
    }

    setupOnTouch(effects) {
        const chain = effects.map((effect) => {
            console.log(`Creating new effect ${effect.name}`);
            if (effect.name === 'audio') {
                return new AudioEffect(this.app, this.sprite, this.resources, effect);
            }
            if (effect.name === 'move') {
                return new MoveEffect(this.app, this.sprite, this.resources, effect);
            }
            if (effect.name === 'bounce') {
                return new BounceEffect(this.app, this.sprite, this.resources, effect);
            }
            if (effect.name === 'transition') {
                return new TransitionEffect(this.app, this.sprite, this.resources, effect);
            }
            if (effect.name === 'fade_out') {
                return new FadeOutEffect(this.app, this.sprite, this.resources, effect);
            }
            if (effect.name === 'spin') {
                return new SpinEffect(this.app, this.sprite, this.resources, effect);
            }
            console.warn(`No effect found for ${effect.name}`);
        });

        this.interactive();
        this.sprite.interactive = true;
        this.sprite.buttonMode = true;
        this.sprite.eventMode = 'static';
        this.sprite.addListener('pointerup', () => {
            chain.forEach((effect) => {
                effect.execute();
            });
        });
    }

    interactive() {
        console.log("This item is interactive...");
        const interactive = this.story.settings.interactive;
        this.sprite.filters = [new PIXI.filters.GlowFilter(
            {
                distance: interactive.distance,
                outerStrength: interactive.strength,
                color: interactive.color
            })];
    }

}

class AudioEffect {

    constructor(app, sprite, resources, props) {
        this.app = app;
        this.resources = resources;
        this.sound = props.sound;
        this.name = props.name;
        this.audio = this.resources[this.sound];
        console.log(`registering ${this.name} effect`);
    }

    execute() {
        if (this.audio.isPlaying) {
            this.audio.stop();
        }
        this.audio.play();
    }

}

class BounceEffect {
    constructor(app, sprite, resources, props) {
        this.app = app;
        this.sprite = sprite;
        this.resources = resources;
        this.name = props.name;
        this.sound = props.sound;
        this.speed = props.speed;
        console.log(`registering ${this.name} effect`);
    }

    execute() {
        this.sprite.position.y = this.sprite.position.y - 100;
    }
}

class TransitionEffect {
    constructor(app, sprite, resources, props) {
        this.app = app;
        this.sprite = sprite;
        this.name = props.name;
        this.resources = resources;
        this.source = props.image;
        this.image = this.resources[props.image];
        console.log(`registering ${this.name} effect`);
    }

    execute() {
        this.sprite.texture = PIXI.Texture.from(this.source);
    }

}

class FadeOutEffect {
    constructor(app, sprite, resources, props) {
        this.app = app;
        this.sprite = sprite;
        this.resources = resources;
        this.name = props.name;
        this.speed = props.speed;
        this.ticker = new PIXI.Ticker();
        this.ticker.add((time) => {
            this.sprite.alpha -= this.speed * time.deltaTime;
            if (this.sprite.alpha <= 0.0) {
                this.ticker.stop();
                this.app.stage.removeChild(this.sprite);
            }
        });

        console.log(`registering ${this.name} effect`);
    }

    execute() {
        this.ticker.start();
    }
}

class SpinEffect {
    constructor(app, sprite, resources, props) {
        this.app = app;
        this.sprite = sprite;
        this.resources = resources;
        this.name = props.name;
        this.sound = props.sound;
        this.speed = props.speed;
        console.log(`registering ${this.name} effect`);
    }

    execute() {
        this.sprite.anchor.set(0.5);
        this.ticker = new PIXI.Ticker();
        this.ticker.add((time) => {
            this.sprite.rotation += 0.1 * time.deltaTime;
        });
        const spinning = this.spin.bind(this);
        spinning();
    }

    spin() {
        if (this.ticker.started) {
            this.ticker.stop();
            this.sprite.rotation = 0;
            return;
        }
        this.ticker.start();
    }

}

class MoveEffect {
    constructor(app, sprite, resources, props) {
        this.app = app;
        this.sprite = sprite;
        this.resources = resources;
        this.name = props.name;
        this.pause_in_ms = props.pause_in_ms;
        this.speed = props.speed;
        this.direction = props.direction;
        console.log(`registering ${this.name} effect`);
    }

    execute() {
        let delay = this.pause_in_ms;
        if (delay === undefined) {
            delay = 0;
        }
        console.log(`${this.name} is waiting for ${delay}ms to move ${this.direction}`);

        setTimeout(() => {
            this.app.ticker.add((delta) => {
                let increment = this.speed;
                if (this.direction === 'left') {
                    increment *= -1;
                }
                this.sprite.position.x += (increment * delta.deltaTime);
            });
        }, delay);
    }

}

// https://pixijs.com/8.x/examples/filters-basic/blur
function toManifest(story) {
    const assets = new Set();
    assets.add(story.splash.image);
    assets.add(story.splash.sound);
    Object.keys(story.scenes)
        .forEach((id) => {
            const scene = story.scenes[id];
            assets.add(scene.background);

            const sounds = scene.sounds;
            if (sounds) {
                sounds.forEach((sound) => {
                    assets.add(sound.file);
                });
            }
            const objects = scene.objects;
            objects.forEach((obj) => {
                assets.add(obj.image);
                if (obj.actions) {
                    const actions = obj.actions;
                    Object.keys(actions)
                        .forEach((action) => {
                            const meta = actions[action];
                            if (meta && meta.effects) {
                                const effects = meta.effects;
                                effects.forEach((effect) => {
                                    if (effect.name === 'audio') {
                                        assets.add(effect.sound);
                                    } else if (effect.name === 'transition') {
                                        assets.add(effect.image);
                                    }
                                });
                            }
                        });
                }
            });
        });

    return Array.from(assets)
        .map(asset => ({alias: asset, src: asset}));

}
