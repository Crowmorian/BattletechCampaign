# Melee / Physical Attacks

A concise reference for standard physical attacks, MEL attacks, Charge, and Death From Above.

## 1. Core idea

A unit generally makes **one attack** in the Combat Phase: either a **weapon attack** or a **physical attack**. Physical attacks do **not** use range modifiers like normal shooting, because they happen in close combat.

## 2. To-hit formula

**Target Number = Skill + Attacker Movement Modifier + Target TMM + Terrain / Cover + Physical / Special Modifiers + Other Modifiers**

| Part | Use this |
| --- | --- |
| Skill | The attacker’s Skill value. |
| Attacker Movement Modifier | Apply the normal movement-based modifier for the attacker. |
| Target TMM | The target’s current Target Movement Modifier. |
| Terrain / Cover | Apply any relevant terrain or cover modifiers. |
| Physical / Special Modifiers | Use modifiers for Charge, DFA, MEL, or other special cases if applicable. |
| Other Modifiers | Any other normal scenario, command, or special ability modifiers that apply. |

## 3. Attack types

| Attack type | Who / requirements | Damage |
| --- | --- | --- |
| Standard Physical Attack | ’Mechs and ProtoMechs. Target must be in firing arc and within **1"**. Elevation difference counts toward that distance. | **Size** |
| Melee Physical Attack (**MEL**) | Only units with **MEL**. Target must be in firing arc and within **2"**. A unit with MEL uses this attack instead of Standard Physical. | **Size + 1** |
| Charge | Declared in the **Movement Phase**. Usually ’Mechs / vehicles. Attacker must end in base contact and the target must have already moved. | **Size + half TMM** (round down) |
| Death From Above (**DFA**) | Jump-capable ’Mechs. Declared in the **Movement Phase**. End in base contact with a target that already moved. | **Charge damage + 1** |

## 4. Charge and DFA self-damage

| Attack | Attacker damage / notes |
| --- | --- |
| Charge | If the charge hits, the attacker takes **half its TMM** (round down). Add **+1** more self-damage if the target is **Size 3 or larger**. |
| DFA | If the DFA hits, the attacker takes damage equal to its **own Size**. If the DFA misses, the attacker takes **Size + 1** damage. |

## 5. Handy reminders

- **Standard** = 1" range, damage equal to **Size**.
- **MEL** = 2" range, damage equal to **Size + 1**.
- **Charge** and **DFA** are declared in the **Movement Phase** and usually require the target to have already moved.
- Big mechs punch hard because physical damage scales with Size.
- DFA is stylish but risky because the attacker always risks heavy self-damage.

## 6. To-hit example

**Example:** A **Hatchetman** (Skill **4**) makes a **MEL** attack against a target in melee range. The Hatchetman moved enough to have an attacker movement modifier of **+1**. The target has TMM **+2** and is in **light woods (+1)**. There are no other special modifiers.

**Target Number = Skill + Attacker Movement Modifier + Target TMM + Terrain / Cover + Physical / Special Modifiers + Other Modifiers**

**Target Number = 4 + 1 + 2 + 1 + 0 + 0 = 8**

So the Hatchetman needs an **8+** on 2D6 to hit with the melee attack. If it hits, because it has MEL and is **Size 2**, it deals **3 damage**.
