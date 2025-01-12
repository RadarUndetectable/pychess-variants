from dataclasses import dataclass
from enum import Enum
from typing import Callable

from compress import (
    encode_move_duck,
    encode_move_flipping,
    encode_move_standard,
    decode_move_duck,
    decode_move_flipping,
    decode_move_standard,
)
from settings import PROD


@dataclass
class Variant:
    code: str
    uci_variant: str
    display_name: str
    icon: str
    chess960: bool = False
    grand: bool = False
    byo: bool = False
    bug: bool = False
    move_encoding: Callable = encode_move_standard
    move_decoding: Callable = decode_move_standard


#  Deferred translations!
def _(message):
    return message


class ServerVariants(Enum):
    def __init__(self, variant):
        self.code = variant.code
        self.uci_variant = variant.uci_variant
        self.display_name = variant.display_name.upper()
        self.translated_name = variant.display_name
        self.icon = variant.icon
        self.chess960 = variant.chess960
        self.grand = variant.grand
        self.byo = variant.byo

    CHESS = Variant("n", "chess", _("Chess"), "M")
    CHESS960 = Variant("n", "chess", _("Chess960"), "V", chess960=True)
    BUGHOUSE = Variant("F", "bughouse", _("Bughouse"), "¢", bug=True)
    BUGHOUSE960 = Variant("F", "bughouse", _("Bughouse960"), "⌀", chess960=True, bug=True)
    CRAZYHOUSE = Variant("h", "crazyhouse", _("Crazyhouse"), "+")
    CRAZYHOUSE960 = Variant("h", "crazyhouse", _("Crazyhouse960"), "%", chess960=True)
    ATOMIC = Variant("A", "atomic", _("Atomic"), "~")
    ATOMIC960 = Variant("A", "atomic", _("Atomic960"), "\\", chess960=True)
    KINGOFTHEHILL = Variant("B", "kingofthehill", _("King of the Hill"), "🏴")
    KINGOFTHEHILL960 = Variant("B", "kingofthehill", _("King of the Hill 960"), "🏁", chess960=True)
    _3CHECK = Variant("X", "3check", _("Three check"), "☰")
    _3CHECK960 = Variant("X", "3check", _("Three check 960"), "☷", chess960=True)
    ANTICHESS = Variant("’", "antichess", _("Antichess"), "🐥")
    ANTICHESS960 = Variant("’", "antichess", _("Antichess960"), "🐓", chess960=True)
    RACINGKINGS = Variant("°", "racingkings", _("Racing Kings"), "🚗")
    RACINGKINGS960 = Variant("°", "racingkings", _("Racing Kings 1440"), "🚙", chess960=True)
    HORDE = Variant("š", "horde", _("Horde"), "🐖")
    HORDE960 = Variant("š", "horde", _("Horde960"), "🐷", chess960=True)
    PLACEMENT = Variant("p", "placement", _("Placement"), "S")
    DUCK = Variant("U", "duck", _("Duck Chess"), "🦆", move_encoding=encode_move_duck, move_decoding=decode_move_duck)  # fmt: skip
    ALICE = Variant("Y", "alice", _("Alice Chess"), "👧")
    FOGOFWAR = Variant("Q", "fogofwar", _("Fog of War"), "🌫")

    MAKRUK = Variant("m", "makruk", _("Makruk"), "Q")
    MAKPONG = Variant("l", "makpong", _("Makpong"), "O")
    CAMBODIAN = Variant("b", "cambodian", _("Ouk Chaktrang"), "!")
    SITTUYIN = Variant("y", "sittuyin", _("Sittuyin"), ":")
    ASEAN = Variant("S", "asean", _("ASEAN"), "♻")

    SHOGI = Variant("g", "shogi", _("Shogi"), "K", byo=True)
    MINISHOGI = Variant("a", "minishogi", _("Minishogi"), "6")
    KYOTOSHOGI = Variant("k", "kyotoshogi", _("Kyoto Shogi"), ")", byo=True, move_encoding=encode_move_flipping, move_decoding=decode_move_flipping)  # fmt: skip
    DOBUTSU = Variant("D", "dobutsu", _("Dobutsu"), "8", byo=True)
    GOROGOROPLUS = Variant("G", "gorogoroplus", _("Gorogoro+"), "🐱", byo=True)
    TORISHOGI = Variant("T", "torishogi", _("Tori Shogi"), "🐦", byo=True)
    CANNONSHOGI = Variant("W", "cannonshogi", _("Cannon Shogi"), "💣", byo=True)

    XIANGQI = Variant("x", "xiangqi", _("Xiangqi"), "|", grand=True)
    MANCHU = Variant("M", "manchu", _("Manchu+"), "{", grand=True)
    JANGGI = Variant("j", "janggi", _("Janggi"), "=", grand=True, byo=True)
    MINIXIANGQI = Variant("e", "minixiangqi", _("Minixiangqi"), "7")

    SHATRANJ = Variant("†", "shatranj", _("Shatranj"), "🐘")
    CAPABLANCA = Variant("c", "capablanca", _("Capablanca"), "P")
    CAPABLANCA960 = Variant("c", "capablanca", _("Capablanca960"), ",", chess960=True)
    CAPAHOUSE = Variant("i", "capahouse", _("Capahouse"), "&")
    CAPAHOUSE960 = Variant("i", "capahouse", _("Capahouse960"), "'", chess960=True)
    GOTHIC = Variant("o", "gothic", _("Gothic"), "P")
    GOTHHOUSE = Variant("t", "gothhouse", _("Gothhouse"), "&")
    EMBASSY = Variant("E", "embassy", _("Embassy"), "P")
    DRAGON = Variant("R", "dragon", _("Dragon Chess"), "🐉")
    SEIRAWAN = Variant("s", "seirawan", _("S-Chess"), "L")
    SEIRAWAN960 = Variant("s", "seirawan", _("S-Chess960"), "}", chess960=True)
    SHOUSE = Variant("z", "shouse", _("S-House"), "$")
    GRAND = Variant("q", "grand", _("Grand"), "(", grand=True)
    GRANDHOUSE = Variant("r", "grandhouse", _("Grandhouse"), "*", grand=True)
    SHOGUN = Variant("u", "shogun", _("Shogun"), "-", byo=True)
    SHAKO = Variant("d", "shako", _("Shako"), "9", grand=True)
    HOPPELPOPPEL = Variant("w", "hoppelpoppel", _("Hoppel-Poppel"), "`")
    MANSINDAM = Variant("I", "mansindam", _("Mansindam"), "⛵")

    ORDA = Variant("f", "orda", _("Orda Chess"), "R")
    KHANS = Variant("L", "khans", _("Khan's Chess"), "🐎")
    SYNOCHESS = Variant("v", "synochess", _("Synochess"), "_")
    SHINOBI = Variant("J", "shinobi", _("Shinobi"), "🐢")
    SHINOBIPLUS = Variant("K", "shinobiplus", _("Shinobi+"), "🐢")
    EMPIRE = Variant("P", "empire", _("Empire"), "♚")
    ORDAMIRROR = Variant("O", "ordamirror", _("Orda Mirror"), "◩")
    CHAK = Variant("C", "chak", _("Chak"), "🐬")
    CHENNIS = Variant("H", "chennis", _("Chennis"), "🎾", move_encoding=encode_move_flipping, move_decoding=decode_move_flipping)  # fmt: skip
    SPARTAN = Variant("N", "spartan", _("Spartan"), "⍺")

    ATAXX = Variant("Z", "ataxx", _("Ataxx"), "☣")

    @property
    def server_name(self):
        return self.uci_variant + ("960" if self.chess960 else "")


del _


def get_server_variant(uci_variant, chess960):
    return ALL_VARIANTS[uci_variant + ("960" if chess960 else "")]


OLD_VARIANTS = (
    ServerVariants.EMBASSY,
    ServerVariants.GOTHIC,
    ServerVariants.GOTHHOUSE,
    ServerVariants.SHINOBI,
)

BUG_VARIANTS = (
    ServerVariants.BUGHOUSE,
    ServerVariants.BUGHOUSE960,
)

ALL_VARIANTS = {variant.server_name: variant for variant in ServerVariants}

VARIANTS = {
    variant.server_name: variant for variant in ServerVariants if variant not in OLD_VARIANTS
}

VARIANT_ICONS = {variant.server_name: variant.icon for variant in ServerVariants}

# Remove new variants on prod site until they stabilize
if PROD:
    for variant in BUG_VARIANTS:
        del VARIANTS[variant.server_name]

C2V = {variant.code: variant.uci_variant for variant in ServerVariants}

GRANDS = tuple(variant.server_name for variant in ServerVariants if variant.grand)

BYOS = tuple(variant.server_name for variant in ServerVariants if variant.byo)


if __name__ == "__main__":
    print(GRANDS)

    from deprecated import VARIANT_ICONS_ORIG, V2C_ORIG

    for sn, variant in VARIANTS.items():
        print(variant.code, variant.icon, sn)
        assert variant.code == V2C_ORIG[variant.uci_variant]
        assert variant.icon == VARIANT_ICONS_ORIG[variant.server_name]
