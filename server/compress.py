from __future__ import annotations
from itertools import product

"""
We use the simplest compression method for moves here: 2 byte square to 1 byte ascii.
For better result consider compressing moves using indexes in valid move lists.
For more sophisticated encoding consider using lichess method described at:
https://lichess.org/blog/Wqa7GiAAAOIpBLoY/developer-update-275-improved-game-compression
"""

R2C = {"1-0": "a", "0-1": "b", "1/2-1/2": "c", "*": "d"}
C2R = {v: k for k, v in R2C.items()}

# Create square to int mapping
M2C = dict(zip([a + b for a, b in product("abcdefghij", "0123456789")], list(range(34, 256))))

# Add possible from parts of drop moves
PIECES = "PNBRQKFGSLACHE"
m2c_len = len(M2C) + 34
for piece in PIECES:
    M2C["%s@" % piece] = m2c_len
    m2c_len += 1

# Kyoto Shogi drop moves can start with extra "+"
for piece in "PLNS":
    M2C["+%s" % piece] = m2c_len
    m2c_len += 1

# More droppable pieces
#   The variant that uses these pieces (shinobi) was added after kyotoshogi
#   so these letters need to be here to be backward compatible
PIECES = "MDJ"
for piece in PIECES:
    M2C["%s@" % piece] = m2c_len
    m2c_len += 1

# Chennis drop moves can start with extra "+" as well (P and S are already added above for Kyoto Shogi)
for piece in "FM":
    M2C["+%s" % piece] = m2c_len
    m2c_len += 1

# More droppable pieces
#   The variant that uses these pieces (cannonshogi) was added after chennis
#   so these letters need to be here to be backward compatible
PIECES = "UI"
m2c_len = len(M2C) + 34
for piece in PIECES:
    M2C["%s@" % piece] = m2c_len
    m2c_len += 1

# More droppable pieces
#   The variant that uses these pieces (melonvariant) was added after cannonshogi
#   so these letters need to be here to be backward compatible
PIECES = "W"
m2c_len = len(M2C) + 34
for piece in PIECES:
    M2C["%s@" % piece] = m2c_len
    m2c_len += 1

# for x in M2C:
#     print(x, M2C[x])

C2M = {v: k for k, v in M2C.items()}


def encode_move_flipping(move):
    return (
        chr(M2C[move[0:2]]) + chr(M2C[move[3:5]]) + "@"
        if move[0] == "+"
        else chr(M2C[move[0:2]]) + chr(M2C[move[2:4]]) + (move[4] if len(move) == 5 else "")
    )


def encode_move_duck(move):
    return (
        chr(M2C[move[0:2]])  # first leg 'from'
        + chr(M2C[move[2:4]])  # first leg 'to'
        + chr(M2C[move[-2:]])  # duck 'to'
        + (move[4] if len(move) == 10 else "")  # promotion
    )


def encode_move_standard(move):
    return chr(M2C[move[0:2]]) + chr(M2C[move[2:4]]) + (move[4] if len(move) == 5 else "")


def decode_move_flipping(move):
    return (
        C2M[ord(move[0])] + "@" + C2M[ord(move[1])]
        if move[-1] == "@"
        else C2M[ord(move[0])] + C2M[ord(move[1])] + (move[2] if len(move) == 3 else "")
    )


def decode_move_duck(move):
    return (
        C2M[ord(move[0])]
        + C2M[ord(move[1])]
        + (move[3] if len(move) == 4 else "")
        + ","
        + C2M[ord(move[1])]
        + C2M[ord(move[2])]
    )


def decode_move_standard(move):
    return C2M[ord(move[0])] + C2M[ord(move[1])] + (move[2] if len(move) == 3 else "")
