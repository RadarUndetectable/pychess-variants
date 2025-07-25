import { FairyStockfish } from 'ffish-es6';
import { CrossTable, MsgBoard } from './messages';

export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;
export type JSONObject = { [member: string]: JSONValue };
export type JSONArray = JSONValue[];

export type BugBoardName = 'a' | 'b';
export type BoardName = '' | BugBoardName;

export type PyChessModel = {
    ffish: FairyStockfish;
    username: string;
    home: string;
    anon: string;
    profileid: string;
    title: string;
    variant: string;
    chess960: string;
    rated: string;
    corr: string;
    level: number;
    gameId: string;
    tournamentId: string;
    tournamentname: string;
    inviter: string;
    ply: number;
    ct: CrossTable | string;
    board: MsgBoard | string;
    wplayer: string;
    wtitle: string;
    wrating: string; // string, because can contain "?" suffix for provisional rating
    wrdiff: number;
    wberserk: string;
    bplayer: string;
    btitle: string;
    brating: string; // string, because can contain "?" suffix for provisional rating
    brdiff: number;
    bberserk: string;
    fen: string;
    posnum: number;
    initialFen: string;
    base: number;
    inc: number;
    byo: number;
    result: string;
    status: number;
    date: string;
    tv: boolean;
    embed: boolean;
    seekEmpty: boolean;
    tournamentDirector: boolean;
    assetURL: string;
    puzzle: string;

    wplayerB: string;
    wtitleB: string;
    wratingB: string; // string, because can contain "?" suffix for provisional rating
    bplayerB: string;
    btitleB: string;
    bratingB: string; // string, because can contain "?" suffix for provisional rating

    blogs: string;
    corrGames: string;
    oauthUsernameSelection: {
        oauth_id: string;
        oauth_provider: string;
        oauth_username: string;
    } | null;
};
