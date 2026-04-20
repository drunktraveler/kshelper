import { UNITS } from './units.js';
import { HEROES } from './heroes.js';
import { GROWTH_TEMPLATES } from './constants.js';

export function runCombatSim(setup, mode = 'average', nWaves = 100) {
    const isStochastic = mode === 'stochastic';
    const atkP = processBatches(setup.atk.batches);
    const defP = processBatches(setup.def.batches);

    let m_cur = { ...atkP.counts }, e_cur = { ...defP.counts };
    const totalStartAtk = Object.values(m_cur).reduce((a, b) => a + b, 0);
    const totalStartDef = Object.values(e_cur).reduce((a, b) => a + b, 0);
    const sq_min = Math.sqrt(Math.min(totalStartAtk, totalStartDef));

    // For stochastic mode, we track which buffs are currently active and for how many rounds
    let activeBuffs = { atk: {}, def: {} }; // { '101': remaining_rounds }

    const getProb = (p, side, id, duration, rngMode) => {
        if (rngMode === 'average' || p <= 0 || p >= 1) return p;
        
        // Stochastic Mode: Real dice rolls
        if (isStochastic) {
            if (activeBuffs[side][id] > 0) return 1; // Buff is already active
            if (Math.random() < p) {
                activeBuffs[side][id] = duration || 0; // Trigger and set duration
                return 1;
            }
            return 0;
        }

        // Statistical Shift Mode (Z=1.0)
        const sigma = Math.sqrt((p * (1 - p)) / nWaves);
        return rngMode === 'lucky' ? Math.min(1, p + 1.0 * sigma) : Math.max(0, p - 1.0 * sigma);
    };

    const m_skill_base = getMultipliers(setup.atk, atkP, 'num');
    const e_skill_base = getMultipliers(setup.def, defP, 'den');
    const widget_mult = Math.pow(1.15, 3);

    let wave = 0;
    while (isAlive(m_cur) && isAlive(e_cur) && wave < 2000) {
        wave++;
        
        // Update buff durations
        ['atk', 'def'].forEach(s => {
            for (let id in activeBuffs[s]) {
                if (activeBuffs[s][id] > 0) activeBuffs[s][id]--;
            }
        });

        const mf_l = ['infantry','cavalry','archers'].find(u => m_cur[u.slice(0,3)] > 1) || 'archers';
        const ef_l = ['infantry','cavalry','archers'].find(u => e_cur[u.slice(0,3)] > 1) || 'archers';
        const mf = mf_l.slice(0, 3), ef = ef_l.slice(0, 3);
        let pending = [];

        [['atk', 'def'], ['def', 'atk']].forEach(([side, target]) => {
            const sP = side === 'atk' ? atkP : defP, tP = side === 'atk' ? defP : atkP;
            const sC = side === 'atk' ? m_cur : e_cur, tC = side === 'atk' ? e_cur : m_cur;
            const sS = setup[side], tS = setup[target];
            const tf = side === 'atk' ? ef : mf;
            const sM_base = side === 'atk' ? m_skill_base : e_skill_base;
            const tM_base = side === 'atk' ? e_skill_base : m_skill_base;
            const luck = side === 'atk' ? mode : (mode === 'lucky' ? 'unlucky' : (mode === 'unlucky' ? 'lucky' : 'average'));

            // Calculate current Skill Multipliers for this specific wave
            let current_s_mod = { inf: 1, cav: 1, arc: 1 };
            let pools = {};
            sS.heroes.forEach((h, i) => {
                if (h.name === "None") return;
                const d = HEROES[h.name];
                const skills = (i < 3) ? d.skills : [d.skills[0]];
                skills.forEach((s, si) => {
                    if (s.group !== (side === 'atk' ? 'num' : 'den')) return;
                    const x = s.values[h[`s${si+1}`]-1];
                    const p = getProb(s.getChance(x), side, `${h.name}_${si}`, s.duration, luck);
                    if (p > 0) {
                        const m = s.getMagnitude(x);
                        s.ids.forEach((id, idx) => {
                            pools[id] = (pools[id] || 0) + (Array.isArray(m) ? m[idx] : m);
                        });
                    }
                });
            });
            let finalMult = 1.0;
            Object.values(pools).forEach(v => finalMult *= (1+v));
            ['inf', 'cav', 'arc'].forEach(u => current_s_mod[u] = finalMult);

            ['inf', 'cav', 'arc'].forEach(u => {
                if (sC[u] <= 0) return;
                const b = sP.avgBase[u], tb = tP.avgBase[tf];
                let atk = b.atk * (1 + (sS.stats[u+'_att'] + sM_base.star)/100);
                let leth = b.leth * (1 + sS.stats[u+'_leth']/100);
                let df = tb.def * (1 + (tS.stats[tf+'_def'] + tM_base.star)/100);
                let hp = tb.hp * (1 + tS.stats[tf+'_hp']/100);

                let tm = ((u === 'inf' && tf === 'cav') || (u === 'cav' && tf === 'arc') || (u === 'arc' && tf === 'inf')) ? 1.1 : 1.0;
                
                // Stochastic Troop Abilities
                let abil = 1.0;
                const w = sP.weights[u];
                if (u === 'arc') {
                    if (Math.random() < (0.10 * w.t7)) abil *= 1.1;
                    const howlingP = w.tg5 ? 0.3 : (w.tg3 ? 0.2 : 0);
                    if (Math.random() < howlingP) abil *= 1.5;
                }
                if (u === 'cav') {
                    const lanceP = w.tg5 ? 0.15 : (w.tg3 ? 0.1 : 0);
                    if (Math.random() < lanceP) abil *= 1.1; // Using +10% damage for Double Hit
                }
                if (tf === 'inf') {
                    const tw = tP.weights.inf;
                    if (u === 'cav') df *= (1 + (0.1 * tw.t7));
                    const shieldP = tw.tg5 ? 0.375 : (tw.tg3 ? 0.25 : 0);
                    if (Math.random() < shieldP) abil *= 0.64;
                }

                const sM = current_s_mod[u] * widget_mult;
                const tM = tM_base.units[tf] * widget_mult; // Simplified target mod for deterministic/avg

                if (u === 'cav' && tC['arc'] > 1 && tf !== 'arc' && w.t7 > 0) {
                    const bypass = Math.random() < (0.2 * w.t7) ? 1 : 0;
                    if (bypass) {
                        const ba = tP.avgBase['arc'];
                        const archDefPct = (tS.stats['arc_def'] + tM_base.star)/100;
                        pending.push({dict: tC, unit: 'arc', amt: (Math.sqrt(sC[u])*sq_min*atk*leth*1.1*abil*sM)/( (ba.def*(1+archDefPct)) * (ba.hp*(1+tS.stats.arc_hp/100)) * 100 * (tM_base.units.arc*widget_mult))});
                    } else {
                        pending.push({dict: tC, unit: tf, amt: (Math.sqrt(sC[u])*sq_min*atk*leth*tm*abil*sM)/(df*hp*100*tM)});
                    }
                } else {
                    if (u === 'cav' && tf === 'arc') abil *= 0.8;
                    pending.push({dict: tC, unit: tf, amt: (Math.sqrt(sC[u])*sq_min*atk*leth*tm*abil*sM)/(df*hp*100*tM)});
                }
            });
        });
        pending.forEach(p => p.dict[p.unit] = Math.max(0, p.dict[p.unit] - p.amt));
    }
    return { m_cur, e_cur, wave, atk_mults: m_skill_base.logs, def_mults: e_skill_base.logs, startAtk: totalStartAtk, startDef: totalStartDef };
}

function getMultipliers(side, proc, type) {
    let pools = {}, starBonus = 0, logs = ["Always Active: Type Advantage (+10% Dmg)"];
    ['inf','cav','arc'].forEach(u => {
        const w = proc.weights[u];
        if (w.t7 > 0) logs.push(`Tier 7+ (${u}): ${(w.t7*100).toFixed(0)}% Efficient`);
        if (w.tg3 > 0) logs.push(`Requirement TG3/5 (${u}): ${(w.tg3*100).toFixed(0)}% Effective`);
    });
    side.heroes.forEach((h, i) => {
        if (h.name === "None") return;
        const d = HEROES[h.name]; starBonus += GROWTH_TEMPLATES[d.template][(h.star * 6) + h.sub] || 0;
    });
    return { units: {inf:1,cav:1,arc:1}, star: starBonus, logs };
}
function isAlive(a) { return (a.inf + a.cav + a.arc) > 1; }
