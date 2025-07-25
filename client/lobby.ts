import { WebsocketHeartbeatJs } from './socket/socket';

import { h, VNode } from 'snabbdom';

import { Api } from "chessgroundx/api";
import { Chessground } from 'chessgroundx';

import { JSONObject } from './types';
import { _, ngettext, languageSettings } from './i18n';
import { patch } from './document';
import { boardSettings } from './boardSettings';
import { chatMessage, chatView, ChatController } from './chat';
import { enabledVariants, twoBoarsVariants, VARIANTS, selectVariant, Variant } from './variants';
import { timeControlStr, changeTabs, setAriaTabClick } from './view';
import { notify } from './notification';
import { PyChessModel } from "./types";
import { MsgBoard, MsgChat, MsgFullChat } from "./messages";
import { variantPanels } from './lobby/layer1';
import { Post, Stream, Spotlight, MsgInviteCreated, MsgHostCreated, MsgGetSeeks, MsgNewGame, MsgGameInProgress, MsgUserConnected, MsgPing, MsgError, MsgShutdown, MsgCounter, MsgStreams, MsgSpotlights, Seek, CreateMode, TvGame, TcMode } from './lobbyType';
import { validFen, uci2LastMove } from './chess';
import { seekViewBughouse, switchEnablingLobbyControls } from "./bug/lobby.bug";
import { handleOngoingGameEvents, Game, gameViewPlaying, compareGames } from './nowPlaying';
import { createWebsocket } from "@/socket/webSocketUtils";


const autoPairingTCs: [number, number, number][] = [
    [1, 0, 0],
    [3, 0, 0],
    [3, 2, 0],
    [5, 5, 0],
    [15, 10, 0],
    [2, 15, 1],
    [10, 30, 1],
];

export function createModeStr(mode: CreateMode) {
    switch (mode) {
    case 'playAI': return _("Play with AI");
    case 'playFriend': return _("Play with a friend");
    case 'createHost': return _("Host a game for others");
    case 'createGame': return _("Create a game");
    default:
        return '';
    }
}

export function disableCorr(disable: boolean) {
    document.querySelectorAll("#tc option").forEach((opt: HTMLInputElement) => {
        if (opt.value == "corr") {
            opt.disabled = disable;
        }
    });
}

export class LobbyController implements ChatController {
    sock: WebsocketHeartbeatJs;
    home: string;
    assetURL: string;
    // player;
    // logged_in;
    username: string;
    profileid: string;
    anon: boolean;
    title: string;
    tournamentDirector: boolean;
    fen: string;
    createMode: CreateMode;
    tcMode: TcMode;
    validGameData: boolean;
    readyState: number;
    seeks: Seek[];
    streams: VNode | HTMLElement;
    spotlights: VNode | HTMLElement;
    dialogHeaderEl: VNode | HTMLElement;
    autoPairingActions: VNode | HTMLElement | null;
    tvGame: TvGame;
    tvGameId: string;
    tvGameChessground: Api;
    minutesValues = [
        0, 1 / 4, 1 / 2, 3 / 4, 1, 3 / 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
        17, 18, 19, 20, 25, 30, 35, 40, 45, 60, 75, 90
    ];
    incrementValues = [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
        25, 30, 35, 40, 45, 60, 90
    ];
    minutesStrings = ["0", "¼", "½", "¾"];
    daysValues = [1, 2, 3, 5, 7, 10, 14];

    constructor(el: HTMLElement, model: PyChessModel) {
        console.log("LobbyController constructor", el, model);

        this.home = model["home"];
        this.assetURL = model["assetURL"];
        this.username = model["username"];
        this.anon = model["anon"] === 'True';
        this.title = model["title"];
        this.tournamentDirector = model["tournamentDirector"];
        this.fen = model["fen"];
        this.profileid = model["profileid"]
        this.createMode = 'createGame';
        this.tcMode = 'real';
        this.validGameData = false;
        this.seeks = [];

        const onOpen = () => {
            console.log('onOpen()');
        }

        this.sock = createWebsocket('wsl', onOpen, () => {}, () => {},(e: MessageEvent) => this.onMessage(e));

        patch(document.querySelector('.seekbuttons') as HTMLElement, h('div.seekbuttons', this.renderSeekButtons()));
        patch(document.querySelector('.seekdialog') as HTMLElement, this.renderSeekDialog());

        const id01modal = document.getElementById('id01') as HTMLElement;
        document.addEventListener("click", (event) => {
            if ((event.target as HTMLElement) == id01modal) this.closeSeekDialog();
        });
        id01modal.addEventListener("cancel", this.closeSeekDialog);

        patch(document.getElementById('lobbychat') as HTMLElement, chatView(this, "lobbychat"));

        patch(document.getElementById('variants-catalog') as HTMLElement, variantPanels(this));

        this.streams = document.getElementById('streams') as HTMLElement;

        this.spotlights = document.getElementById('spotlights') as HTMLElement;

        this.dialogHeaderEl = document.getElementById('header-block') as HTMLElement;

        // challenge!
        if (this.profileid !== "") {
            if (this.profileid === 'Fairy-Stockfish') {
                this.createMode = 'playAI';
                this.preSelectVariant(model.variant);
            }
            else if (this.profileid === 'Invite-friend') this.createMode = 'playFriend';
            document.getElementById('game-mode')!.style.display = (this.anon || this.createMode === 'playAI') ? 'none' : 'inline-flex';
            this.renderDialogHeader(_('Challenge %1 to a game', this.profileid));
            document.getElementById('ailevel')!.style.display = this.createMode === 'playAI' ? 'block' : 'none';
            document.getElementById('rmplay-block')!.style.display = this.createMode === 'playAI' ? 'block' : 'none';
            (document.getElementById('id01') as HTMLDialogElement).showModal();
            document.getElementById('color-button-group')!.style.display = 'block';
            document.getElementById('create-button')!.style.display = 'none';

            if (this.profileid === 'any#') {
                this.profileid = '';
                this.createGame();
            }
        }

        // Seek from Editor with custom start position
        if (this.fen !== "") {
            this.createGame(model.variant);
        }

        setAriaTabClick("lobby_tab");

        const tabId = localStorage.lobby_tab ?? "tab-1";
        let initialEl = document.getElementById(tabId) as HTMLElement;
        if (initialEl === null) initialEl = document.getElementById('tab-1') as HTMLElement;
        initialEl.setAttribute('aria-selected', 'true');
        (initialEl!.parentNode!.parentNode!.querySelector(`#${initialEl.getAttribute('aria-controls')}`)! as HTMLElement).style.display = 'block';

        const e = document.getElementById("fen") as HTMLInputElement;
        if (this.fen !== "")
            e.value = this.fen;

        if (!this.anon) {
            this.renderAutoPairingTable();
            this.autoPairingActions = document.querySelector('div.auto-pairing-actions') as HTMLElement | null;
        }

        boardSettings.assetURL = this.assetURL;
        boardSettings.updateBoardAndPieceStyles();
    }

    doSend(message: JSONObject) {
        // console.log("---> lobby doSend():", message);
        this.sock.send(JSON.stringify(message));
    }

    createSeekMsg(variant: string, color: string, fen: string, minutes: number, increment: number, byoyomiPeriod: number, day: number, chess960: boolean, rated: boolean, rrMin: number, rrMax: number) {
        this.doSend({
            type: "create_seek",
            user: this.username,
            target: this.profileid,
            variant: variant,
            fen: fen,
            minutes: minutes,
            increment: increment,
            byoyomiPeriod: byoyomiPeriod,
            day: day,
            rated: rated,
            rrmin: rrMin,
            rrmax: rrMax,
            chess960: chess960,
            color: color
        });
    }

    createInviteFriendMsg(variant: string, color: string, fen: string, minutes: number, increment: number, byoyomiPeriod: number, day: number, chess960: boolean, rated: boolean) {
        this.doSend({
            type: "create_invite",
            user: this.username,
            target: 'Invite-friend',
            variant: variant,
            fen: fen,
            minutes: minutes,
            increment: increment,
            byoyomiPeriod: byoyomiPeriod,
            day: day,
            rated: rated,
            chess960: chess960,
            color: color
        });
    }

    createBotChallengeMsg(variant: string, color: string, fen: string, minutes: number, increment: number, byoyomiPeriod: number, level: number, rm: boolean, chess960: boolean, rated: boolean) {
        this.doSend({
            type: "create_ai_challenge",
            rm: rm,
            user: this.username,
            variant: variant,
            fen: fen,
            minutes: minutes,
            increment: increment,
            byoyomiPeriod: byoyomiPeriod,
            rated: rated,
            level: level,
            chess960: chess960,
            color: color
        });
    }

    createHostMsg(variant: string, color: string, fen: string, minutes: number, increment: number, byoyomiPeriod: number, chess960: boolean, rated: boolean) {
        this.doSend({
            type: "create_host",
            user: this.username,
            target: 'Invite-friend',
            variant: variant,
            fen: fen,
            minutes: minutes,
            increment: increment,
            byoyomiPeriod: byoyomiPeriod,
            rated: rated,
            chess960: chess960,
            color: color
        });
    }

    isNewSeek(variant: string, color: string, fen: string, minutes: number, increment: number, byoyomiPeriod: number, day: number, chess960: boolean, rated: boolean) {
        // console.log("isNewSeek()?", variant, color, fen, minutes, increment, byoyomiPeriod, chess960, rated);
        // console.log(this.seeks);
        return !this.seeks.some(seek =>
            seek.user === this.username &&
            seek.variant === variant &&
            seek.fen === fen &&
            seek.color === color &&
            seek.base === minutes &&
            seek.inc === increment &&
            seek.byoyomi === byoyomiPeriod &&
            seek.day === day &&
            seek.chess960 === chess960 &&
            seek.rated === rated
        );
    }

    closeSeekDialog() {
        (document.getElementById('id01') as HTMLDialogElement).close();
        (document.activeElement as HTMLElement).blur();
    }

    createSeek(color: string) {
        this.closeSeekDialog();
        if (!this.validGameData) return;

        let e;
        e = document.getElementById('variant') as HTMLSelectElement;
        const variant = VARIANTS[e.options[e.selectedIndex].value];
        localStorage.seek_variant = variant.name;

        // TODO Standardize seek color
        let seekColor;
        if (variant.name.endsWith('shogi') && color !== 'r')
            seekColor = (color === 'w') ? 'b' : 'w';
        else
            seekColor = color;

        e = document.getElementById('fen') as HTMLInputElement;
        let fen = e.value;
        // Prevent to create 'custom' games with standard startFen
        if (variant.name !== 'ataxx' && fen.trim() === variant.startFen) fen = '';

        e = document.getElementById('min') as HTMLInputElement;
        const minutes = this.minutesValues[Number(e.value)];
        localStorage.seek_min = e.value;

        e = document.getElementById('inc') as HTMLInputElement;
        const increment = this.incrementValues[Number(e.value)];
        localStorage.seek_inc = e.value;

        e = document.getElementById('byo') as HTMLInputElement;
        const byoyomi = variant.rules.defaultTimeControl === "byoyomi";
        const byoyomiPeriod = (byoyomi && increment > 0) ? Number(e.value) : 0;
        localStorage.seek_byo = e.value;

        let day = 0;
        if (this.tcMode === 'corr') {
            e = document.getElementById('day') as HTMLInputElement;
            day = this.daysValues[Number(e.value)];
            localStorage.seek_day = e.value;
            const corrTab = document.getElementById('tab-2') as HTMLInputElement;
            changeTabs('lobby_tab', corrTab)
            // TODO: use meaningful names!!!
        }
        e = document.querySelector('input[name="mode"]:checked') as HTMLInputElement;
        let rated: boolean;
        if (this.createMode === 'playAI' ||
            this.anon ||
            this.title === "BOT" ||
            fen !== "" ||
            (minutes < 1 && increment === 0) ||
            (minutes === 0 && increment === 1)
            )
            rated = false;
        else
            rated = e.value === "1";
        localStorage.seek_rated = e.value;

        e = document.getElementById('rating-min') as HTMLInputElement;
        const rrMin = Number(e.value);
        localStorage.seek_rating_min = e.value;

        e = document.getElementById('rating-max') as HTMLInputElement;
        const rrMax = Number(e.value);
        localStorage.seek_rating_max = e.value;

        e = document.getElementById('chess960') as HTMLInputElement;
        const chess960 = (variant.chess960 && fen.trim() === "") ? e.checked : false;
        localStorage.seek_chess960 = e.checked;

        // console.log("CREATE SEEK variant, color, fen, minutes, increment, hide, chess960", variant, color, fen, minutes, increment, chess960, rated, rrMin, rrMax);

        switch (this.createMode) {
            case 'playAI':
                e = document.querySelector('input[name="level"]:checked') as HTMLInputElement;
                const level = Number(e.value);
                localStorage.seek_level = e.value;
                // console.log(level, e.value, localStorage.getItem("seek_level"));
                e = document.getElementById('rmplay') as HTMLInputElement;
                if (!'alice, fogofwar'.includes(variant.name)) {
                    localStorage.seek_rmplay = e.checked;
                }
                const rm = e.checked;
                this.createBotChallengeMsg(variant.name, seekColor, fen, minutes, increment, byoyomiPeriod, level, rm, chess960, rated);
                break;
            case 'playFriend':
                this.createInviteFriendMsg(variant.name, seekColor, fen, minutes, increment, byoyomiPeriod, day, chess960, rated);
                break;
            case 'createHost':
                this.createHostMsg(variant.name, seekColor, fen, minutes, increment, byoyomiPeriod, chess960, rated);
                break;
            default:
                if (this.isNewSeek(variant.name, seekColor, fen, minutes, increment, byoyomiPeriod, day, chess960, rated))
                    this.createSeekMsg(variant.name, seekColor, fen, minutes, increment, byoyomiPeriod, day, chess960, rated, rrMin, rrMax);
        }
        // prevent to create challenges continuously
        this.profileid = '';
        window.history.replaceState({}, this.title, '/');

        // We need to ask the user for permission
        notify(null, undefined);
    }

    setTcMode(tcMode: TcMode) {
        if (tcMode !== this.tcMode) {
            this.tcMode = tcMode;
            document.getElementById('real')!.style.display = this.tcMode === 'real' ? 'block' : 'none';
            document.getElementById('corr')!.style.display = this.tcMode === 'corr' ? 'block' : 'none';
        }
    }

    renderDialogHeader(header: string) {
        this.dialogHeaderEl = patch(this.dialogHeaderEl, h('div#header-block', [h('h2', header)]));
    }

    renderSeekButtons() {
        return [
            h('button.lobby-button', { on: { click: () => this.createGame() } }, createModeStr('createGame')),
            h('button.lobby-button', { on: { click: () => this.playFriend() } }, createModeStr('playFriend')),
            h('button.lobby-button', { on: { click: () => this.playAI() } }, createModeStr('playAI')),
            h('button.lobby-button', { on: { click: () => this.createHost() }, style: { display: this.tournamentDirector ? "block" : "none" } }, createModeStr('createHost')),
        ];
    }

    renderSeekDialog() {
        const vVariant = localStorage.seek_variant || "chess";
        const twoBoards = VARIANTS[vVariant].twoBoards;
        // 5+3 default TC needs vMin 9 because of the partial numbers at the beginning of minutesValues
        const vMin = localStorage.seek_min ?? "9";
        const vInc = localStorage.seek_inc ?? "3";
        const vByoIdx = (localStorage.seek_byo ?? 1) - 1;
        const vDay = localStorage.seek_day ?? "1";
        const vRated = twoBoards ? "0": localStorage.seek_rated ?? "0";
        const vRatingMin = localStorage.seek_rating_min ?? -1000;
        const vRatingMax = localStorage.seek_rating_max ?? 1000;
        const vLevel = Number(localStorage.seek_level ?? "1");
        const vChess960 = localStorage.seek_chess960 ?? "false";
        const vRMplay = localStorage.seek_rmplay ?? "false";
        return h('dialog#id01.modal', [
                h('form.modal-content', [
                    h('span#closecontainer', [
                        h('span.close', {
                            on: { click: this.closeSeekDialog },
                            attrs: { 'data-icon': 'j' }, props: { title: _("Cancel") }
                        }),
                    ]),
                    h('div.container', [
                        h('div', [
                            h('div#header-block'),
                            h('div', [
                                h('label', { attrs: { for: "variant" } }, _("Variant")),
                                selectVariant("variant", vVariant, () => this.setVariant(), () => this.setVariant()),
                            ]),
                            h('input#fen', {
                                props: { name: 'fen', placeholder: _('Paste the FEN text here') + (this.anon ? _(' (must be signed in)') : ''),  autocomplete: "off" },
                                on: { input: () => this.setFen() },
                            }),
                            h('div#alternate-start-block'),
                            h('div#chess960-block', [
                                h('label', { attrs: { for: "chess960" } }, "Chess960"),
                                h('input#chess960', {
                                    props: {
                                        name: "chess960",
                                        type: "checkbox",
                                    },
                                    attrs: {
                                        checked: vChess960 === "true"
                                    },
                                }),
                            ]),
                            h('div.tc-block',[
                                h('div', [
                                    h('label', { attrs: { for: "tc" } }, _("Time control")),
                                    h('select#tc', {
                                        props: { name: 'tc' },
                                        on: { change: (e: Event) => this.setTcMode((e.target as HTMLSelectElement).value as TcMode) },
                                        }, [
                                            h('option', { attrs: { value: 'real' }}, _('Real time')),
                                            h('option', { attrs: { value: 'corr', disabled: this.anon || twoBoards }}, _('Correspondence')),
                                        ]
                                    ),
                                ]),
                                h('div#tc_settings', [
                                    h('div#real', [
                                        h('label', { attrs: { for: "min" } }, _("Minutes per side:")),
                                        h('span#minutes'),
                                        h('input#min.slider', {
                                            props: { name: "min", type: "range", min: 0, max: this.minutesValues.length - 1, value: vMin },
                                            on: { input: e => this.setMinutes(parseInt((e.target as HTMLInputElement).value)) },
                                            hook: { insert: vnode => this.setMinutes(parseInt((vnode.elm as HTMLInputElement).value)) },
                                        }),
                                        h('label#incrementlabel', { attrs: { for: "inc" } }, ''),
                                        h('span#increment'),
                                        h('input#inc.slider', {
                                            props: { name: "inc", type: "range", min: 0, max: this.incrementValues.length - 1, value: vInc },
                                            on: { input: e => this.setIncrement(this.incrementValues[parseInt((e.target as HTMLInputElement).value)]) },
                                            hook: { insert: vnode => this.setIncrement(this.incrementValues[parseInt((vnode.elm as HTMLInputElement).value)]) },
                                        }),
                                        h('div#byoyomi-period', [
                                            h('label#byoyomiLabel', { attrs: { for: "byo" } }, _('Periods')),
                                            h('select#byo', {
                                                props: { name: "byo" },
                                            },
                                                [ 1, 2, 3 ].map((n, idx) => h('option', { props: { value: n }, attrs: { selected: (idx === vByoIdx) } }, n))
                                            ),
                                        ]),
                                    ]),
                                    h('div#corr',[
                                        h('label', { attrs: { for: "day" } }, _("Days per turn:")),
                                        h('span#days'),
                                        h('input#day.slider', {
                                            props: { name: "day", type: "range", min: 0, max: this.daysValues.length - 1, value: vDay },
                                            on: { input: e => this.setDays(parseInt((e.target as HTMLInputElement).value)) },
                                            hook: { insert: vnode => this.setDays(parseInt((vnode.elm as HTMLInputElement).value)) },
                                        }),
                                    ]),
                                ]),
                            ]),
                            h('form#game-mode', [
                                h('div.radio-group', [
                                    h('input#casual', {
                                        props: { type: "radio", name: "mode", value: "0" },
                                        attrs: { checked: vRated === "0" },
                                        on: { input: e => this.setCasual((e.target as HTMLInputElement).value) },
                                        hook: { insert: vnode => this.setCasual((vnode.elm as HTMLInputElement).value) },
                                    }),
                                    h('label', { attrs: { for: "casual"} }, _("Casual")),
                                    h('input#rated', {
                                        props: { type: "radio", name: "mode", value: "1" },
                                        attrs: { checked: vRated === "1", disabled: this.anon || twoBoards }, /*dont support rated bughouse atm*/
                                        on: { input: e => this.setRated((e.target as HTMLInputElement).value) },
                                        hook: { insert: vnode => this.setRated((vnode.elm as HTMLInputElement).value) },
                                    }),
                                    h('label', { attrs: { for: "rated"} }, _("Rated")),
                                ]),
                            ]),
                            h('div#rating-range-setting', [
                                _('Rating range'),
                                h('div.rating-range', [
                                    h('input#rating-min.slider', {
                                        props: { name: "rating-min", type: "range", min: -1000, max: 0, step: 50, value: vRatingMin },
                                        on: { input: e => this.setRatingMin(parseInt((e.target as HTMLInputElement).value)) },
                                        hook: { insert: vnode => this.setRatingMin(parseInt((vnode.elm as HTMLInputElement).value)) },
                                    }),
                                    h('div.rating-min', '-1000'),
                                    h('span', '/'),
                                    h('div.rating-max', '+1000'),
                                    h('input#rating-max.slider', {
                                        props: { name: "rating-max", type: "range", min: 0, max: 1000, step: 50, value: vRatingMax },
                                        on: { input: e => this.setRatingMax(parseInt((e.target as HTMLInputElement).value)) },
                                        hook: { insert: vnode => this.setRatingMax(parseInt((vnode.elm as HTMLInputElement).value)) },
                                    }),
                                ]),
                            ]),
                            // if play with the machine
                            h('div#rmplay-block', [
                                h('label', { attrs: { for: "rmplay" } }, "Random-Mover"),
                                h('input#rmplay', {
                                    props: {
                                        name: "rmplay",
                                        type: "checkbox",
                                        title: _("Practice with Random-Mover"),
                                    },
                                    attrs: {
                                        checked: vRMplay === "true"
                                    },
                                    on: { click: () => this.setRM() },
                                }),
                            ]),
                            // A.I.Level (1-8 buttons)
                            h('form#ailevel', [
                                h('h4', _("A.I. Level")),
                                h('div.radio-group',
                                    [ 0, 1, 2, 3, 4, 5, 6, 7, 8 ].map(level => [
                                        h('input#ai' + level, { props: { type: "radio", name: "level", value: level }, attrs: { checked: vLevel === level } }),
                                        h('label.level-ai.ai' + level, { attrs: { for: "ai" + level } }, level),
                                    ]).reduce((arr, v) => (arr.push(...v), arr), []) // flatmap
                                ),
                            ]),
                            h('div#color-button-group', [
                                h('button.icon.icon-black', { props: { type: "button", title: _("Black") }, on: { click: () => this.createSeek('b') } }),
                                h('button.icon.icon-adjust', { props: { type: "button", title: _("Random") }, on: { click: () => this.createSeek('r') } }),
                                h('button.icon.icon-white', { props: { type: "button", title: _("White") }, on: { click: () => this.createSeek('w') } }),
                            ]),
                            h('div#create-button', [
                                h('button', { props: { type: "button" }, on: { click: () => this.createSeek('w') } }, _("Create")),
                            ]),
                        ]),
                    ]),
                ]),
            ])
    }

    autoPairingSelectAll() {
        document.querySelectorAll('input[name^="va_"]').forEach((inp: HTMLInputElement) => {
            inp.checked = true;
        });
        document.querySelectorAll('input[name^="tc_"]').forEach((inp: HTMLInputElement) => {
            inp.checked = true;
        });
    }

    autoPairingReset() {
        document.querySelectorAll('input[name^="va_"]').forEach((inp: HTMLInputElement) => {
            inp.checked = false;
        });
        document.querySelectorAll('input[name^="tc_"]').forEach((inp: HTMLInputElement) => {
            inp.checked = false;
        });
    }

    autoPairingCancel() {
        this.doSend({ type: "cancel_auto_pairing" });
    }

    autoPairingSubmit() {
        const variants: [string, boolean][] = [];
        document.querySelectorAll('input[name^="va_"]').forEach((inp: HTMLInputElement) => {
            localStorage[inp.name] = inp.checked;
            if (inp.checked) {
                const chess960 = inp.name.endsWith('960');
                const name = (chess960) ? inp.name.slice(3, -3) : inp.name.slice(3);
                variants.push([name, chess960]);
            }
        })

        const tcs: [number, number, number][] = [];
        document.querySelectorAll('input[name^="tc_"]').forEach((inp: HTMLInputElement, index: number) => {
            localStorage[inp.name] = inp.checked;
            if (inp.checked) tcs.push(autoPairingTCs[index]);
        })

        const minEle = document.getElementById('auto-rating-min') as HTMLInputElement;
        const rrMin = Number(minEle.value);
        localStorage.auto_rating_min = minEle.value;

        const maxEle = document.getElementById('auto-rating-max') as HTMLInputElement;
        const rrMax = Number(maxEle.value);
        localStorage.auto_rating_max = maxEle.value;

        this.doSend({ type: "create_auto_pairing", variants: variants, tcs: tcs, rrmin: rrMin, rrmax: rrMax });
    }

    preSelectVariant(variantName: string, chess960: boolean=false) {
        if (variantName !== '') {
            const select = document.getElementById("variant") as HTMLSelectElement;
            const options = Array.from(select.options).map(o => o.value);
            if (select) select.selectedIndex = options.indexOf(variantName);

            this.setVariant();

            const check = document.getElementById("chess960") as HTMLInputElement;
            if (check) check.checked = chess960;
        }
    }

    renderVariantsDropDown(variantName: string = '', disabled: string[]) {
        // variantName and chess960 are set when this was called from the variant catalog (layer3.ts)
        let vVariant = variantName || localStorage.seek_variant || "chess";
        if (disabled.includes(vVariant)) vVariant = "chess";
        const vChess960 = localStorage.seek_chess960 === 'true' || false;
        const e = document.getElementById('variant');
        e!.replaceChildren();
        patch(e!, selectVariant("variant", disabled.includes(vVariant)? null: vVariant, () => this.setVariant(), () => this.setVariant(), disabled));
        this.preSelectVariant(vVariant, vChess960);
    }

    createGame(variantName: string = '') {
        const twoBoards = (variantName) ? VARIANTS[variantName].twoBoards : false;
        this.createMode = 'createGame';
        this.renderVariantsDropDown(variantName, this.anon ? twoBoarsVariants: []);
        this.renderDialogHeader(createModeStr(this.createMode));
        document.getElementById('game-mode')!.style.display = this.anon ? 'none' : 'inline-flex';
        document.getElementById('rating-range-setting')!.style.display = 'block';
        document.getElementById('ailevel')!.style.display = 'none';
        document.getElementById('rmplay-block')!.style.display = 'none';
        (document.getElementById('id01') as HTMLDialogElement).showModal();
        document.getElementById('color-button-group')!.style.display = 'block';
        document.getElementById('create-button')!.style.display = 'none';
        disableCorr(this.anon || twoBoards);
    }

    playFriend(variantName: string = '') {
        this.createMode = 'playFriend';
        this.renderVariantsDropDown(variantName, twoBoarsVariants);
        this.renderDialogHeader(createModeStr(this.createMode))
        document.getElementById('game-mode')!.style.display = this.anon ? 'none' : 'inline-flex';
        document.getElementById('rating-range-setting')!.style.display = 'none';
        document.getElementById('ailevel')!.style.display = 'none';
        document.getElementById('rmplay-block')!.style.display = 'none';
        (document.getElementById('id01') as HTMLDialogElement).showModal();
        document.getElementById('color-button-group')!.style.display = 'block';
        document.getElementById('create-button')!.style.display = 'none';
        disableCorr(false);
    }

    playAI(variantName: string = '') {
        this.createMode = 'playAI';
        this.renderVariantsDropDown(variantName, twoBoarsVariants);
        this.renderDialogHeader(createModeStr(this.createMode))
        document.getElementById('game-mode')!.style.display = 'none';
        document.getElementById('rating-range-setting')!.style.display = 'none';
        const e = document.getElementById('rmplay') as HTMLInputElement;
        document.getElementById('ailevel')!.style.display = e.checked ? 'none' : 'inline-block';
        document.getElementById('rmplay-block')!.style.display = 'block';
        (document.getElementById('id01') as HTMLDialogElement).showModal();
        document.getElementById('color-button-group')!.style.display = 'block';
        document.getElementById('create-button')!.style.display = 'none';
        disableCorr(true);
    }

    createHost(variantName: string = '') {
        this.createMode = 'createHost';
        this.renderVariantsDropDown(variantName, twoBoarsVariants);
        this.renderDialogHeader(createModeStr(this.createMode))
        document.getElementById('game-mode')!.style.display = this.anon ? 'none' : 'inline-flex';
        document.getElementById('rating-range-setting')!.style.display = 'none';
        document.getElementById('ailevel')!.style.display = 'none';
        document.getElementById('rmplay-block')!.style.display = 'none';
        (document.getElementById('id01') as HTMLDialogElement).showModal();
        document.getElementById('color-button-group')!.style.display = 'none';
        document.getElementById('create-button')!.style.display = 'block';
        disableCorr(true);
    }

    private setVariant() {
        let e;
        e = document.getElementById('variant') as HTMLSelectElement;
        const variant = VARIANTS[e.options[e.selectedIndex].value];
        const byoyomi = variant.rules.defaultTimeControl === "byoyomi";
        if (variant.twoBoards) {
            const select = document.getElementById('tc') as HTMLSelectElement;
            select.selectedIndex = 0;
            this.tcMode = 'real';
        }
        // TODO use toggle class instead of setting style directly
        document.getElementById('chess960-block')!.style.display = variant.chess960 ? 'block' : 'none';
        document.getElementById('byoyomi-period')!.style.display = byoyomi ? 'block' : 'none';
        document.getElementById('corr')!.style.display = this.tcMode === 'corr' ? 'block' : 'none';
        e = document.getElementById('fen') as HTMLInputElement;
        e.value = "";
        e = document.getElementById('incrementlabel') as HTMLSelectElement;
        patch(e, h('label#incrementlabel', { attrs: { for: "inc"} }, (byoyomi ? _('Byoyomi in seconds:') : _('Increment in seconds:'))));
        e = document.getElementById('alternate-start-block') as HTMLElement;
        e.innerHTML = "";
        if (variant.alternateStart) {
            patch(e, h('div#alternate-start-block', [
                h('label', { attrs: { for: "alternate-start" } }, _("Alternate Start")),
                h('select#alternate-start', {
                    props: { name: "alternate-start" },
                    on: { input: () => this.setAlternateStart(variant) },
                    hook: { insert: () => this.setAlternateStart(variant) },
                },
                    Object.keys(variant.alternateStart).map(alt =>
                        h('option', { props: { value: alt } }, _(alt))
                    )
                ),
            ]));
        }
        // Select Random-Mover but disable FSF play for "unsupported by FSF" variants
        if (this.createMode === 'playAI') {
            e = document.getElementById('rmplay') as HTMLInputElement;
            if ('alice, fogofwar'.includes(variant.name)) {
                e.checked = true;
                document.getElementById('ailevel')!.style.display = 'none';
            } else {
                const vRMplay = localStorage.seek_rmplay ?? "false";
                e.checked = vRMplay === "true";
                document.getElementById('ailevel')!.style.display = e.checked ? 'none' : 'inline-block';
            }
        }
        switchEnablingLobbyControls(this.createMode, variant, this.anon);
        this.setStartButtons();
    }
    private setAlternateStart(variant: Variant) {
        let e: HTMLSelectElement;
        e = document.getElementById('alternate-start') as HTMLSelectElement;
        const alt = e.options[e.selectedIndex].value;
        e = document.getElementById('fen') as HTMLSelectElement;
        e.value = variant.alternateStart![alt];
        (document.getElementById('chess960') as HTMLInputElement).disabled = alt !== "";
        this.setFen();
    }
    private setMinutes(val: number) {
        const minutes = val < this.minutesStrings.length ? this.minutesStrings[val] : String(this.minutesValues[val]);
        document.getElementById("minutes")!.innerHTML = minutes;
        this.setStartButtons();
    }
    private setIncrement(increment: number) {
        document.getElementById("increment")!.innerHTML = ""+increment;
        this.setStartButtons();
    }
    private setDays(val: number) {
        const days = this.daysValues[val];
        document.getElementById("days")!.innerHTML = String(days);
        this.setStartButtons();
    }
    private setRatingMin(val: number) {
        document.querySelector("div.rating-min")!.innerHTML = '-' + String(Math.abs(val));
    }
    private setRatingMax(val: number) {
        document.querySelector("div.rating-max")!.innerHTML = '+' + String(val);
    }
    private setAutoRatingMin(val: number) {
        document.querySelector("div.auto-rating-min")!.innerHTML = '-' + String(Math.abs(val));
    }
    private setAutoRatingMax(val: number) {
        document.querySelector("div.auto-rating-max")!.innerHTML = '+' + String(val);
    }
    private setFen() {
        const e = document.getElementById('fen') as HTMLInputElement;
        e.setCustomValidity(this.validateFen() ? '' : _('Invalid FEN'));
        this.setStartButtons();
    }
    private setCasual(casual: string) {
        console.log("setCasual", casual);
        this.setStartButtons();
    }
    private setRated(rated: string) {
        console.log("setRated", rated);
        this.setStartButtons();
    }
    private setRM() {
        const e = document.getElementById('rmplay') as HTMLInputElement;
        document.getElementById('ailevel')!.style.display = e.checked ? 'none' : 'block';
    }
    private setStartButtons() {
        this.validGameData = this.validateTimeControl() && this.validateFen();
        const e = document.getElementById('color-button-group') as HTMLElement;
        e.classList.toggle("disabled", !this.validGameData);
    }
    private validateTimeControl() {
        const min = Number((document.getElementById('min') as HTMLInputElement).value);
        const inc = Number((document.getElementById('inc') as HTMLInputElement).value);
        const minutes = this.minutesValues[min];

        const e = document.querySelector('input[name="mode"]:checked') as HTMLInputElement;
        const rated = e.value === "1";

        const atLeast = (this.createMode === 'playAI') ? ((min > 0 && inc > 0) || (min >= 1 && inc === 0)) : (min + inc > 0);
        const tooFast = (minutes < 1 && inc === 0) || (minutes === 0 && inc === 1);

        return atLeast && !(tooFast && rated);
    }
    private validateFen() {
        const e = document.getElementById('variant') as HTMLSelectElement;
        const variant = e.options[e.selectedIndex].value;
        const fen = (document.getElementById('fen') as HTMLInputElement).value;
        return fen === "" || validFen(VARIANTS[variant], fen);
    }

    renderSeeks(seeks: Seek[]) {
        seeks.sort((a, b) => (a.bot && !b.bot) ? 1 : -1);
        const rows = seeks.map(seek => this.seekView(seek));
        return [ seekHeader(), h('tbody', rows) ];
    }

    private seekViewRegular(seek:Seek) {
        const variant = VARIANTS[seek.variant];
        const chess960 = seek.chess960;

        return h('tr', { on: { click: () => this.onClickSeek(seek) } }, [
            h('td', [ this.colorIcon(seek.color) ]),
            h('td', [ this.challengeIcon(seek), this.seekTitle(seek), this.user(seek) ]),
            h('td', seek.rating),
            h('td', timeControlStr(seek.base, seek.inc, seek.byoyomi, seek.day)),
            h('td.icon', { attrs: { "data-icon": variant.icon(chess960) } }, [h('variant-name', " " + variant.displayName(chess960))]),
            h('td', { class: { tooltip: seek.fen !== '' } }, [
                this.tooltip(seek, variant),
                this.mode(seek),
            ]),
        ])
    }

    private seekView(seek: Seek) {
        const variant = VARIANTS[seek.variant];
        return this.hide(seek) ? "" : variant.twoBoards ? seekViewBughouse(this, seek): this.seekViewRegular(seek);
    }

    private onClickSeek(seek: Seek) {
        if (seek["user"] === this.username) {
            this.doSend({ type: "delete_seek", seekID: seek["seekID"], player: this.username });
        } else {
            if (this.anon && seek.day !== 0) {
                alert(_('You need an account to do that.'));
                return;
            }
            this.doSend({ type: "accept_seek", seekID: seek["seekID"], player: this.username });
        }
    }

    private colorIcon(color: string) {
        return h('i-side.icon', {
            class: {
                "icon-adjust": color === "r",
                "icon-white":  color === "w",
                "icon-black":  color === "b",
            }
        });
    }

    public challengeIcon(seek: Seek) {
        const swords = (seek["user"] === this.username) ? 'vs-swords.icon' : 'vs-swords.opp.icon';
        return (seek['target'] === '') ? null : h(swords, { attrs: {"data-icon": '"'} });
    }
    public seekTitle(seek: Seek) {
        return (seek['target'] === '') ? h('player-title', " " + seek["title"] + " ") : null;
    }
    private user(seek: Seek) {
        if (seek["target"] === '' || seek["target"] === this.username)
            return seek["user"];
        else
            return seek["target"];
    }
    private hide(seek: Seek) {
        return ((this.anon || this.title === 'BOT') && seek["rated"]) ||
            (this.anon && VARIANTS[seek.variant].twoBoards) ||
            (seek['target'] !== '' && this.username !== seek['user'] && this.username !== seek['target']);
    }
    public tooltip(seek: Seek, variant: Variant) {
        let tooltipImage;
        if (seek.fen) {
            tooltipImage = h('minigame.' + variant.boardFamily + '.' + variant.pieceFamily, [
                h('div.cg-wrap.' + variant.board.cg + '.minitooltip',
                    { hook: { insert: (vnode) => Chessground(vnode.elm as HTMLElement, {
                        coordinates: false,
                        fen: seek.fen,
                        dimensions: variant.board.dimensions,
                    })}}
                ),
            ]);
        } else {
            tooltipImage = '';
        }
        return h('span.tooltiptext', [ tooltipImage ]);
    }

    public mode(seek: Seek) {
        if (seek.fen)
            return _("Custom");
        else if (seek.rated)
            return _("Rated");
        else
            return _("Casual");
    }

    private streamView(stream: Stream) {
        const url = (stream.site === 'twitch') ? 'https://www.twitch.tv/' : 'https://www.youtube.com/channel/';
        const tail = (stream.site === 'youtube') ? '/live' : '';
        return h('a.stream', { attrs: { "href": url + stream.streamer + tail, "rel": "noopener nofollow", "target": "_blank" } }, [
            h('strong.text', {class: {"icon": true, "icon-mic": true} }, stream.username),
            stream.title,
        ]);
    }

    private spotlightView(spotlight: Spotlight) {
        const variant = VARIANTS[spotlight.variant];
        const chess960 = spotlight.chess960;
        const dataIcon = variant.icon(chess960);
        const lang = languageSettings.value;
        const name = spotlight.names[lang] ?? spotlight.names['en'];

        return h('a.tour-spotlight', { attrs: { "href": "/tournament/" + spotlight.tid } }, [
            h('i.icon', { attrs: { "data-icon": dataIcon } }),
            h('span.content', [
                h('span.name', name),
                h('span.more', [
                    h('nb', ngettext('%1 player', '%1 players', spotlight.nbPlayers) + ' • '),
                    h('info-date', { attrs: { "timestamp": spotlight.startsAt } } )
                ])
            ])
        ]);
    }

    renderEmptyTvGame() {
        patch(document.getElementById('tv-game') as HTMLElement, h('a#tv-game.empty'));
    }

    renderTvGame() {
        if (this.tvGame === undefined) return;

        const game = this.tvGame;
        const variant = VARIANTS[game.variant];
        const elements = [
        h(`div#mainboard.${variant.boardFamily}.${variant.pieceFamily}.${variant.ui.boardMark}`, {
            class: { "with-pockets": !!variant.pocket },
            style: { "--ranks": (variant.pocket) ? String(variant.board.dimensions.height) : "undefined" },
            on: { click: () => window.location.assign('/' + game.gameId) }
            }, [
                h(`div.cg-wrap.${variant.board.cg}.mini`, {
                    hook: {
                        insert: vnode => {
                            const cg = Chessground(vnode.elm as HTMLElement,  {
                                fen: game.fen,
                                lastMove: uci2LastMove(game.lastMove),
                                dimensions: variant.board.dimensions,
                                coordinates: false,
                                viewOnly: true,
                                addDimensionsCssVarsTo: document.body,
                                pocketRoles: variant.pocket?.roles,
                            });
                            this.tvGameChessground = cg;
                            this.tvGameId = game.gameId;
                        }
                    }
                }),
        ]),
        h('span.vstext', [
            h('div.player', [h('tv-user', [h('player-title', game.bt), ' ' + game.b + ' ', h('rating', game.br)])]),
            h('div.player', [h('tv-user', [h('player-title', game.wt), ' ' + game.w + ' ', h('rating', game.wr)])]),
        ]),
        ];

        patch(document.getElementById('tv-game') as HTMLElement, h('a#tv-game', elements));

        boardSettings.assetURL = this.assetURL;
        boardSettings.updateBoardAndPieceStyles();
    }

    renderAutoPairingActions(autoPairingIsOn: boolean) {
        const eRange = document.querySelector('div.auto-rating-range') as Element;
        const eTimeControls = document.querySelector('div.timecontrols') as Element;
        const eVariants = document.querySelector('div.variants') as Element;
        if (autoPairingIsOn) {
            if (this.autoPairingActions) {
                this.autoPairingActions = patch(this.autoPairingActions,
                    h('div.auto-pairing-actions', [
                        h('span.standingby', _('Standing by for auto pairing...')),
                        h('button.cancel', { on: { click: () => this.autoPairingCancel() } }, [h('div.icon.icon-ban', _('CANCEL'))]),
                    ])
                );
            }
            eRange.classList.toggle("disabled", true);
            eTimeControls.classList.toggle("disabled", true);
            eVariants.classList.toggle("disabled", true);
        } else {
            if (this.autoPairingActions) {
                this.autoPairingActions = patch(this.autoPairingActions,
                    h('div.auto-pairing-actions', [
                        h('button.selectall', { on: { click: () => this.autoPairingSelectAll() } }, [h('div.icon.icon-check', _('SELECT ALL'))]),
                        h('button.reset', { on: { click: () => this.autoPairingReset() } }, [h('div.icon.icon-trash-o', _('CLEAR ALL'))]),
                        h('button.submit', { on: { click: () => this.autoPairingSubmit() } }, [h('div.icon.icon-check',  _('SUBMIT'))]),
                    ])
                );
            }
            eRange.classList.toggle("disabled", false);
            eTimeControls.classList.toggle("disabled", false);
            eVariants.classList.toggle("disabled", false);
        }
    }

    renderAutoPairingTable() {
        const variantList: VNode[] = [];
        enabledVariants.forEach(v => {
            const variant = VARIANTS[v];
            let variantName = variant.name;
            let checked = localStorage[`va_${variantName}`] ?? "false";
            if (!variant.twoBoards) {
                variantList.push(h('label', [h('input', { props: { name: `va_${variantName}`, type: "checkbox" }, attrs: { checked: checked === "true" } }), variantName]));
                if (variant.chess960) {
                    variantName = variantName + '960';
                    checked = localStorage[`va_${variantName}`] ?? "false";
                    variantList.push(h('label', [h('input', { props: { name: `va_${variantName}`, type: "checkbox" }, attrs: { checked: checked === "true" } }), variantName]));
                }
            }
        })
        patch(document.querySelector('div.variants') as Element, h('div.variants', variantList));

        const tcList: VNode[] = [];
        autoPairingTCs.forEach(v => {
            const tcName = timeControlStr(v[0], v[1], v[2]);
            const checked = localStorage[`tc_${tcName}`] ?? "false";
            tcList.push(h('label', [h('input', { props: { name: `tc_${tcName}`, type: "checkbox" }, attrs: { checked: checked === "true" } }), tcName]));
        })

        patch(document.querySelector('div.timecontrols') as Element, h('div.timecontrols', tcList));

        const aRatingMin = localStorage.auto_rating_min ?? -1000;
        const aRatingMax = localStorage.auto_rating_max ?? 1000;
        const aRatingRange = [
            _('Rating range'),
            h('div.rating-range', [
                h('input#auto-rating-min.slider', {
                    props: { name: "rating-min", type: "range", min: -1000, max: 0, step: 50, value: aRatingMin },
                    on: { input: e => this.setAutoRatingMin(parseInt((e.target as HTMLInputElement).value)) },
                    hook: { insert: vnode => this.setAutoRatingMin(parseInt((vnode.elm as HTMLInputElement).value)) },
                }),
                h('div.auto-rating-min', '-1000'),
                h('span', '/'),
                h('div.auto-rating-max', '+1000'),
                h('input#auto-rating-max.slider', {
                    props: { name: "rating-max", type: "range", min: 0, max: 1000, step: 50, value: aRatingMax },
                    on: { input: e => this.setAutoRatingMax(parseInt((e.target as HTMLInputElement).value)) },
                    hook: { insert: vnode => this.setAutoRatingMax(parseInt((vnode.elm as HTMLInputElement).value)) },
                }),
            ]),
        ];

        patch(document.querySelector('div.auto-rating-range') as Element, h('div.auto-rating-range', aRatingRange));
    }

    onMessage(evt: MessageEvent) {
        // console.log("<+++ lobby onMessage():", evt.data);
        if (evt.data === '/n') return;
        const msg = JSON.parse(evt.data);
        switch (msg.type) {
            case "get_seeks":
                this.onMsgGetSeeks(msg);
                break;
            case "new_game":
                this.onMsgNewGame(msg);
                break;
            case "game_in_progress":
                this.onMsgGameInProgress(msg);
                break;
            case "lobby_user_connected":
                this.onMsgUserConnected(msg);
                break;
            case "lobbychat":
                this.onMsgChat(msg);
                break;
            case "fullchat":
                this.onMsgFullChat(msg);
                break;
            case "ping":
                this.onMsgPing(msg);
                break;
            case "tv_game":
                this.onMsgTvGame(msg);
                break;
            case "board":
                this.onMsgBoard(msg);
                break;
            case "g_cnt":
                this.onMsgGameCounter(msg);
                break;
            case "u_cnt":
                this.onMsgUserCounter(msg);
                break;
            case "ap_cnt":
                this.onMsgAutoPairingCounter(msg);
                break;
            case "streams":
                this.onMsgStreams(msg);
                break;
            case "spotlights":
                this.onMsgSpotlights(msg);
                break;
            case "invite_created":
                this.onMsgInviteCreated(msg);
                break;
            case "host_created":
                this.onMsgHostCreated(msg);
                break;
            case "auto_pairing_on":
                this.onMsgAutoPairingOn();
                break;
            case "auto_pairing_off":
                this.onMsgAutoPairingOff();
                break;
            case "shutdown":
                this.onMsgShutdown(msg);
                break;
            case "error":
                this.onMsgError(msg);
                break;
            case "logout":
                this.doSend({type: "logout"});
                break;
        }
    }

    private onMsgInviteCreated(msg: MsgInviteCreated) {
        window.location.assign('/invite/' + msg.gameId);
    }

    private onMsgHostCreated(msg: MsgHostCreated) {
        window.location.assign('/invite/' + msg.gameId);
    }

    private onMsgAutoPairingOn() {
        if (!this.anon) this.renderAutoPairingActions(true);
    }

    private onMsgAutoPairingOff() {
        if (!this.anon) this.renderAutoPairingActions(false);
    }

    private onMsgGetSeeks(msg: MsgGetSeeks) {
        this.seeks = msg.seeks;
        // console.log("!!!! got get_seeks msg:", msg);

        const oldSeeks = document.querySelector('.seek-container table.seeks') as Element;
        oldSeeks.innerHTML = "";
        patch(oldSeeks, h('table.seeks', this.renderSeeks(msg.seeks.filter(seek => seek.day === 0))));

        const oldCorrs = document.querySelector('.corr-container table.seeks') as Element;
        oldCorrs.innerHTML = "";
        patch(oldCorrs, h('table.seeks', this.renderSeeks(msg.seeks.filter(seek => seek.day !== 0))));
    }

    private onMsgNewGame(msg: MsgNewGame) {
        window.location.assign('/' + msg.gameId);
    }

    private onMsgGameInProgress(msg: MsgGameInProgress) {
        const response = confirm(_("You have an unfinished game!\nPress OK to continue."));
        if (response) window.location.assign('/' + msg.gameId);
    }

    private onMsgUserConnected(msg: MsgUserConnected) {
        this.username = msg.username;
    }

    private onMsgChat(msg: MsgChat) {
        chatMessage(msg.user, msg.message, "lobbychat", msg.time);
    }

    private onMsgFullChat(msg: MsgFullChat) {
        // To prevent multiplication of messages we have to remove old messages div first
        patch(document.getElementById('messages') as HTMLElement, h('div#messages-clear'));
        // then create a new one
        patch(document.getElementById('messages-clear') as HTMLElement, h('div#messages'));
        // console.log("NEW FULL MESSAGES");
        msg.lines.forEach(line => chatMessage(line.user, line.message, "lobbychat", line.time));
    }

    private onMsgPing(msg: MsgPing) {
        this.doSend({ type: "pong", timestamp: msg.timestamp });
    }

    private onMsgError(msg: MsgError) {
        alert(msg.message);
    }

    private onMsgShutdown(msg: MsgShutdown) {
        alert(msg.message);
    }

    private onMsgGameCounter(msg: MsgCounter) {
        // console.log("Gcnt=", msg.cnt);
        const gameCount = document.getElementById('g_cnt') as HTMLElement;
        patch(gameCount, h('counter#g_cnt', ngettext('%1 game in play', '%1 games in play', msg.cnt)));
    }

    private onMsgUserCounter(msg: MsgCounter) {
        // console.log("Ucnt=", msg.cnt);
        const userCount = document.getElementById('u_cnt') as HTMLElement;
        patch(userCount as HTMLElement, h('counter#u_cnt', ngettext('%1 player', '%1 players', msg.cnt)));
    }

    private onMsgAutoPairingCounter(msg: MsgCounter) {
        // console.log("APcnt=", msg.cnt);
        const gameCount = document.getElementById('ap_cnt') as HTMLElement;
        patch(gameCount, h('counter#ap_cnt', ngettext('%1 auto pairing', '%1 auto pairings', msg.cnt)));
    }

    private onMsgStreams(msg: MsgStreams) {
        this.streams = patch(this.streams, h('div#streams', msg.items.map(stream => this.streamView(stream))));
    }

    private onMsgSpotlights(msg: MsgSpotlights) {
        this.spotlights = patch(this.spotlights, h('div#spotlights', [
            h('div', msg.items.map(spotlight => this.spotlightView(spotlight))),
            h('a.cont-link', { attrs: { href: '/calendar' } }, _('Tournament calendar') + ' »'),
        ]));
    }

    private onMsgTvGame(msg: TvGame) {
        this.tvGame = msg;
        this.renderEmptyTvGame();
        this.renderTvGame();
    }

    private onMsgBoard = (msg: MsgBoard) => {
        if (this.tvGameChessground === undefined || this.tvGameId !== msg.gameId) {
            return;
        };

        this.tvGameChessground.set({
            fen: msg.fen,
            turnColor: msg.fen.split(" ")[1] === "w" ? "white" : "black",
            check: msg.check,
            lastMove: uci2LastMove(msg.lastMove),
        });
    }
}

function seekHeader() {
    return h('thead', [
        h('tr', [
            h('th', [h('div#santa')]),
            h('th', _('Player')),
            h('th', _('Rating')),
            h('th', _('Time')),
            h('th', _('Variant')),
            h('th', _('Mode'))
        ])
    ]);
}

function runSeeks(vnode: VNode, model: PyChessModel) {
    const el = vnode.elm as HTMLElement;
    new LobbyController(el, model);
    // console.log("lobbyView() -> runSeeks()", el, model, ctrl);
}

export function lobbyView(model: PyChessModel): VNode[] {
    const puzzle = JSON.parse(model.puzzle);
    const blogs = JSON.parse(model.blogs);
    const username = model.username;
    const anonUser = model["anon"] === 'True';
    const corrGames = JSON.parse(model.corrGames).sort(compareGames(username));
    const gpCounter = corrGames.length;

    const myTurnGameCounter = (sum: number, game: Game) => sum + ((game.tp === username) ? 1 : 0);
    const count = corrGames.reduce(myTurnGameCounter, 0);

    const variant = VARIANTS[puzzle.variant];
    const turnColor = puzzle.fen.split(" ")[1] === "w" ? "white" : "black";
    const first = _(variant.colors.first);
    const second = _(variant.colors.second);

    const dailyPuzzle = [
        h('span.vstext', [
            h('span.text', _('Puzzle of the day')),
            h('span.text', _('%1 to play', (turnColor === 'white') ? first : second)),
        ]),
        h(`div#mainboard.${variant.boardFamily}.${variant.pieceFamily}.${variant.ui.boardMark}`, {
            class: { "with-pockets": !!variant.pocket },
            style: { "--ranks": (variant.pocket) ? String(variant.board.dimensions.height) : "undefined" },
            }, [
                h(`div.cg-wrap.${variant.board.cg}.mini`, {
                    hook: {
                        insert: vnode => {
                            Chessground(vnode.elm as HTMLElement,  {
                                orientation: variant.name === 'racingkings' ? 'white' : turnColor,
                                fen: puzzle.fen,
                                dimensions: variant.board.dimensions,
                                coordinates: false,
                                viewOnly: true,
                                addDimensionsCssVarsTo: document.body,
                                pocketRoles: variant.pocket?.roles,
                            });
                        }
                    }
                }),
        ]),
    ];

    let tabs = [];
    tabs.push(h('span', {attrs: {role: 'tab', 'aria-selected': false, 'aria-controls': 'panel-1', id: 'tab-1', tabindex: '-1'}}, _('Lobby')));
    tabs.push(h('span', {attrs: {role: 'tab', 'aria-selected': false, 'aria-controls': 'panel-2', id: 'tab-2', tabindex: '-1'}}, _('Correspondence')))
    if (corrGames.length > 0) {
        tabs.push(h('span', {attrs: {role: 'tab', 'aria-selected': false, 'aria-controls': 'panel-3', id: 'tab-3', tabindex: '-1'}}, [
            ngettext('%1 game in play', '%1 games in play', gpCounter),
            h('span.noread.data-count', {attrs: { 'data-count': count }})
        ]))
    }
    if (!anonUser) {
        tabs.push(h('span', {attrs: {role: 'tab', 'aria-selected': false, 'aria-controls': 'panel-4', id: 'tab-4', tabindex: '-1'}}, _('Auto pairing')))
    }

    let containers = [];
    containers.push(h('div', {attrs: {role: 'tablist', 'aria-label': 'Seek Tabs'}}, tabs));
    containers.push(
        h('div.seek-container', {attrs: {id: 'panel-1', role: 'tabpanel', tabindex: '-1', 'aria-labelledby': 'tab-1'}}, [
            h('div.seeks-table', [
                h('div.seeks-wrapper', h('table.seeks', { hook: { insert: vnode => runSeeks(vnode, model) } })),
            ])
        ])
    );
    containers.push(
        h('div.corr-container', {attrs: {id: 'panel-2', role: 'tabpanel', tabindex: '-1', 'aria-labelledby': 'tab-2'}}, [
            h('div.seeks-table', [
                h('div.seeks-wrapper', h('table.seeks')),
            ])
        ])
    );
    if (corrGames.length > 0) {
        const cgMap: {[gameId: string]: [Api, string]} = {};
        handleOngoingGameEvents(username, cgMap);

        containers.push(
            h('div.games-container', {attrs: {id: 'panel-3', role: 'tabpanel', tabindex: '-1', 'aria-labelledby': 'tab-3'}}, [
                h('div.seeks-table', [
                    h('div.seeks-wrapper', [
                        h('games-grid#games', corrGames.map((game: Game) => gameViewPlaying(cgMap, game, username)))
                    ])
                ])
            ])
        )
    }

    if (!anonUser) {
        containers.push(
            h('div.auto-container', {attrs: {id: 'panel-4', role: 'tabpanel', tabindex: '-1', 'aria-labelledby': 'tab-4'}}, [
                h('div.seeks-table', [h('div.seeks-wrapper', [h('div.auto-pairing', [
                    h('div.auto-pairing-actions'),
                    h('div.auto-rating-range'),
                    h('div.timecontrols'),
                    h('div.variants'),
                ])])])
            ])
        )
    }

    return [
        h('aside.sidebar-first', [
            h('div#streams'),
            h('div#spotlights'),
            h('div#lobbychat')
        ]),
        h('div.seeks', containers),
        h('div#variants-catalog'),
        h('aside.sidebar-second', [
            h('div.seekbuttons'),
            h('div.lobby-count', [
                h('a', { attrs: { href: '/players' } }, [ h('counter#u_cnt') ]),
                h('a', { attrs: { href: '/games' } }, [ h('counter#g_cnt') ]),
                h('counter#ap_cnt'),
            ]),
            h('div.seekdialog'),
        ]),
        h('under-left', [
            h('a.reflist', { attrs: { href: 'https://discord.gg/aPs8RKr', rel: "noopener", target: "_blank" } }, 'Discord'),
            h('a.reflist', { attrs: { href: 'https://github.com/gbtami/pychess-variants', rel: "noopener", target: "_blank" } }, 'Github'),
            h('a.reflist', { attrs: { href: 'https://www.youtube.com/channel/UCj_r_FSVXQFLgZLwSeFBE8g', rel: "noopener", target: "_blank" } }, 'YouTube'),
            h('div.internalLinks', [
                h('a.reflist', { attrs: { href: '/patron' } }, _("Donate")),
                h('a.reflist', { attrs: { href: '/faq' } }, _("FAQ")),
                h('a.reflist', { attrs: { href: '/stats' } }, _("Stats")),
                h('a.reflist', { attrs: { href: '/about' } }, _("About")),
            ]),
        ]),
        h('div.tv', [h('a#tv-game', { attrs: {href: '/tv'} })]),
        h('under-lobby', [
            h('posts', blogs.map((post: Post) =>
                h('a.post', { attrs: {href: `/blogs/${post['_id']}`} }, [
                    h('img', { attrs: {src: model.assetURL + `${post['image']}`, alt: `${post['alt']}`} }),
                    h('time', `${post['date']}`),
                    h('span.author', [
                        h('player-title', `${post['atitle']} `),
                        `${post['author']}`,
                    ]),
                    h('span.text', [
                        h('strong', `${post['title']}`),
                        h('span', `${post['subtitle']}`),
                    ]),
                ])
            )),
        ]),
        h('div.puzzle', [h('a#daily-puzzle', { attrs: {href: '/puzzle/daily'} }, dailyPuzzle)]),
    ];
}
