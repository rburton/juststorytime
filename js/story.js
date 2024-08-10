class Story {

    constructor(json) {
        this.data = json;
        this.settings = json.settings;
        this.scenes = json.scenes;
        this.manifest = [
            {alias: 'splash_img', src: json.splash.image},
            {alias: 'splash_sound', src: json.splash.sound},
        ];

        Object.keys(this.scenes)
            .forEach((id) => {
                const scene = this.data.scenes[id];
                this.manifest.push({alias: `${id}_background`, src: scene.background});
                const sounds = scene.sounds;
                if (sounds) {
                    sounds.forEach((sound) => {
                        this.manifest.push({alias: `${sound.id}_sound`, src: sound.file});
                    });
                }
                const objects = scene.objects;
                objects.forEach((obj) => {
                    this.manifest.push({alias: `${obj.name}_object`, src: obj.image});
                    if (obj.actions) {
                        const actions = obj.actions;
                        Object.keys(actions)
                            .forEach((action) => {
                                const meta = actions[action];
                                if (meta.sound) {
                                    this.manifest.push({alias: `${meta.sound}_sound`, src: meta.sound});
                                }
                            });
                    }
                });
            });
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
        this.onTouch = {};
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
        }
        this.configureActions();
        this.app.stage.addChild(this.sprite);
        this.animate();
        this.dropFromSky();
    }

    animate() {
        this.dropFromSky();
        if (this.data.animate) {
            const animate = this.data.animate;
            let delay = animate.pause_in_ms;

            if (delay === undefined) {
                delay = 0;
            }
            console.log(`${this.name} is waiting for ${delay}ms to move ${animate.type}`);
            setTimeout(() => {
                this.app.ticker.add((delta) => {
                    let increment = animate.speed;
                    if (animate.type === 'right_to_left') {
                        increment *= -1;
                    }
                    this.sprite.position.x += (increment * delta.deltaTime);
                });
            }, delay);

        }
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
                        this.setupOnTouch(meta);
                    }
                });
        }
    }

    setupOnTouch(meta) {
        this.onTouch = meta;
        this.interactive();
        this.sprite.interactive = true;
        this.sprite.buttonMode = true;
        this.sprite.eventMode = 'static';
        this.sprite.addListener('pointerup', this.findOnTouchAction(meta));
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

    findOnTouchAction(meta) {
        const action = meta.action;
        console.log(`finding associative onTouch function for ${meta.action}`);
        if (action === 'jump') {
            return this.jump.bind(this);
        }
        if (action === 'spin') {
            this.sprite.anchor.set(0.5);
            this.ticker = new PIXI.Ticker();
            this.ticker.add((time) => {
                this.sprite.rotation += 0.1 * time.deltaTime;
            });
            return this.spin.bind(this);
        }
        if (action === 'fade_out') {
            this.ticker = new PIXI.Ticker();
            this.ticker.add((time) => {
                this.sprite.alpha -= meta.speed * time.deltaTime;
                if (this.sprite.alpha <= 0.0) {
                    this.ticker.stop();
                    this.app.stage.removeChild(this.sprite);

                }
            });
            return () => {
                this.ticker.start();
                if (meta.sound) {
                    this.resources[meta.sound].play();
                }
            };
        }
        if (meta.sound) {
            return (e) => {
                this.resources[meta.sound].play();
            }
        }

        return (e) => {
        };
    }

    jump() {
        const soundFile = this.onTouch.sound;
        if (soundFile) {
            this.resources[soundFile].play();
        }
        this.sprite.position.y = this.sprite.position.y - 100;
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
