from __future__ import annotations
from typing import TypeAlias

# Old value used as ref pointing to the id of the new row
OldRefToNewId: TypeAlias = dict[str, int]

# Old id pointing to the new one
IdMap = dict[int, int]
