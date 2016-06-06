
import postRobot from 'post-robot/src';
import { SyncPromise as Promise } from 'sync-browser-mocks/src/promise';
import { BaseComponent } from './base';
import { noop, once, extend, getParentWindow, onCloseWindow } from '../util';
import { CONSTANTS } from '../constants';

export class ChildComponent extends BaseComponent {

    constructor(component, options = {}) {
        super(component, options);

        this.validate(options);

        this.component = component;

        this.standalone = options.standalone;

        this.onEnter = once(this.tryCatch(options.onEnter || noop));
        this.onExit  = once(this.tryCatch(options.onExit  || noop));
        this.onClose = once(this.tryCatch(options.onClose || noop));
        this.onError = once(this.tryCatch(options.onError || function(err) { throw err; }));
        this.onProps = this.tryCatch(options.onProps || noop);

        this.props = options.defaultProps || {};

        try {
            this.setWindows();
        } catch (err) {

            if (this.standalone) {
                return;
            }

            throw err;
        }
    }

    init() {
        if (this.standalone && !this.parentComponentWindow) {
            return Promise.resolve();
        }

        return this.sendToParentComponent(CONSTANTS.POST_MESSAGE.INIT).then(data => {

            this.listen(this.parentComponentWindow);

            this.context = data.context;
            extend(this.props, data.props);

            this.onEnter.call(this);
            this.onProps.call(this);

        }).catch(err => this.onError(err));
    }

    sendToParentComponent(name, data) {
        return postRobot.send(this.parentComponentWindow, CONSTANTS.POST_MESSAGE.INIT);
    }

    setWindows() {

        if (window.__activeXComponent__) {
            throw new Error(`[${this.component.tag}] Can not attach multiple components to the same window`);
        }

        window.__activeXComponent__ = this;

        this.parentWindow = getParentWindow();

        if (!this.parentWindow) {
            throw new Error(`[${this.component.tag}] Can not find parent window`);
        }

        let winProps = this.getWindowProps();

        if (!winProps) {
            throw new Error(`[${this.component.tag}] Window has not been rendered by xcomponent - can not attach here`);
        }

        if (winProps.proxy && winProps.parent) {
            this.parentComponentWindow = this.parentWindow.frames[winProps.parent];
        } else {
            this.parentComponentWindow = this.parentWindow;
        }

        this.id = winProps.id;

        this.watchForClose();
    }

    watchForClose() {

        onCloseWindow(this.parentWindow, () => {
            this.onClose(new Error(`[${this.component.tag}] parent window was closed`));
            if (this.context === CONSTANTS.CONTEXT.POPUP) {
                window.close();
            }
        });

        if (this.parentComponentWindow && this.parentComponentWindow !== this.parentWindow) {
            onCloseWindow(this.parentComponentWindow, () => {
                this.close(new Error(`[${this.component.tag}] parent component window was closed`));
            });
        }
    }

    validate(options) {
        // pass
    }

    listeners() {
        return {
            [ CONSTANTS.POST_MESSAGE.PROPS ](source, data) {
                extend(this.props, data.props);
                this.onProps.call(this);
            },

            [ CONSTANTS.POST_MESSAGE.CLOSE ](source, data) {
                return this.close();
            },

            [ CONSTANTS.POST_MESSAGE.RESIZE ](source, data) {
                window.resizeTo(data.width, data.height);
            }
        };
    }

    close(err) {
        this.onClose.call(this, err);
        return postRobot.sendToParent(CONSTANTS.POST_MESSAGE.CLOSE);
    }

    focus() {
        window.focus();
    }

    resize(height, width) {
        return Promise.resolve().then(() => {

            if (this.context === CONSTANTS.CONTEXT.POPUP) {
                window.resizeTo(width, height);

            } else if (this.context === CONSTANTS.CONTEXT.IFRAME) {
                return postRobot.sendToParent(CONSTANTS.POST_MESSAGE.RESIZE, {
                    height,
                    width
                });
            }
        });
    }

    redirectParent(url) {
        this.onClose.call(this);
        this.parentWindow.location = url;
    }

    breakOut() {
        this.redirectParent(window.location.href);
    }

    error(err) {
        return this.sendToParentComponent(CONSTANTS.POST_MESSAGE.ERROR, {
            error: err.stack || err.toString()
        });
    }
}
