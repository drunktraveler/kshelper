import { UNITS } from './units.js';
import { HEROES } from './heroes.js';
import { GROWTH_TEMPLATES } from './constants.js';

export function runCombatSim(setup, atkLuck = 'average', defLuck = 'average', nWaves = 100) {
    const atkP = processBatches(setup.atk.batches);
    const defP = processBatches(setup.def.batches);

    let m_cur = { ...atkP.counts }, e_cur = { ...defP.counts };
    const totalStartAtk = Object.values(m_cur).reduce((a, b) => a + b, 0);
    const totalStartDef = Object.values(e_cur).reduce((a, b) => a + b, 0);
    const sq_min = Math.sqrt(Math.min(totalStartAtk, totalStartDef));

    // Shift Helper - Uses the side-specific luck mode
    const getShiftedProb = (p, mode) => {
        if (mode === 'average' || p <= 0 || p >= 1) return p;
        const sigma = Math.sqrt((p * (1 - p)) / nWaves);
        return mode === 'lucky' ? Math.min(1, p + 1.645 * sigma) : Math.max(0, p - 1.645 * sigma);
    };

    const m_skill = getMultipliers(setup.atk, atkP, 'num', atkLuck, getShiftedProb);
    const e_skill = getMultipliers(setup.def, defP, 'den', defLuck, getShiftedProb);
    const widget_mult = Math.pow(1.15, 3);

    let wave = 0;
    while (isAlive(m_cur) && isAlive(e_cur) && wave < 2000) {
        wave++;
        const mf_l = ['infantry','cavalry','archers'].find(u => m_cur[u.slice(0,3)] > 1) || 'archers';
        const ef_l = ['infantry','cavalry','archers'].find(u => e_cur[u.slice(0,3)] > 1) || 'archers';
        const mf = mf_l.slice(0, 3), ef = ef_l.slice(0, 3);
        let pending = [];

        [['atk', 'def'], ['def', 'atk']].forEach(([side, target]) => {
            const sP = side === 'atk' ? atkP : defP, tP = side === 'atk' ? defP : atkP;
            const sC = side === 'atk' ? m_cur : e_cur, tC = side === 'atk' ? e_cur : m_cur;
            const sS = setup[side], tS = setup[target];
            const tf = side === 'atk' ? ef : mf;
            const sMod = side === 'atk' ? m_skill : e_skill, tMod = side === 'atk' ? e_skill : m_skill;
            const sLuck = side === 'atk' ? atkLuck : defLuck;
            const tLuck = side === 'atk' ? defLuck : atkLuck;

            ['inf', 'cav', 'arc'].forEach(u => {
                if (sC[u] <= 0) return;
                const b = sP.avgBase[u], tb = tP.avgBase[tf];
                
                let atk = b.atk * (1 + (sS.stats[u+'_att'] + sMod.star)/100);
                let leth = b.leth * (1 + sS.stats[u+'_leth']/100);
                let df = tb.def * (1 + (tS.stats[tf+'_def'] + tMod.star)/100);
                let hp = tb.hp * (1 + tS.stats[tf+'_hp']/100);

                let tm = ((u === 'inf' && tf === 'cav') || (u === 'cav' && tf === 'arc') || (u === 'arc' && tf === 'inf')) ? 1.1 : 1.0;
                
                let abil = 1.0;
                const w = sP.weights[u];
                // Apply abilities shifted by this side's luck
                if (u === 'arc') {
                    const volleyEff = getShiftedProb(0.10 * w.t7, sLuck);
                    const windEff = getShiftedProb((w.tg5 * 0.30) + ((w.tg3 - w.tg5) * 0.20), sLuck);
                    abil *= (1 + volleyEff) * (1 + (windEff * 0.50));
                }
                if (u === 'cav') {
                    const lanceEff = getShiftedProb((w.tg5 * 0.15) + ((w.tg3 - w.tg5) * 0.10), sLuck);
                    abil *= (1 + lanceEff);
                }
                if (tf === 'inf') {
                    const tw = tP.weights.inf;
                    if (u === 'cav') df *= (1 + (0.1 * tw.t7));
                    const shieldEff = getShiftedProb((tw.tg5 * 0.375) + ((tw.tg3 - tw.tg5) * 0.25), tLuck);
                    abil *= (1 - (shieldEff * 0.36));
                }

                const sM = sMod.units[u] * widget_mult, tM = tMod.units[tf] * widget_mult;

                if (u === 'cav' && tC['arc'] > 1 && tf !== 'arc' && w.t7 > 0) {
                    const bypass = getShiftedProb(0.2 * w.t7, sLuck);
                    pending.push({dict: tC, unit: tf, amt: (Math.sqrt(sC[u])*sq_min*atk*leth*tm*abil*(1-bypass)*sM)/(df*hp*100*tM)});
                    const ba = tP.avgBase['arc'];
                    pending.push({dict: tC, unit: 'arc', amt: (Math.sqrt(sC[u])*sq_min*atk*leth*1.1*abil*bypass*sM)/( (ba.def*(1+(tS.stats.arc_def+tMod.star)/100)) * (ba.hp*(1+tS.stats.arc_hp/100)) * 100 * (tMod.units.arc*widget_mult))});
                } else {
                    if (u === 'cav' && tf === 'arc') abil *= 0.8;
                    pending.push({dict: tC, unit: tf, amt: (Math.sqrt(sC[u])*sq_min*atk*leth*tm*abil*sM)/(df*hp*100*tM)});
                }
            });
        });
        pending.forEach(p => p.dict[p.unit] = Math.max(0, p.dict[p.unit] - p.amt));
    }
    return { m_cur, e_cur, wave, atk_mults: m_skill.logs, def_mults: e_skill.logs, startAtk: totalStartAtk, startDef: totalStartDef };
}

function getMultipliers(side, proc, type, luckMode, shiftFn) {
    let pools = {}, starBonus = 0, logs = ["Always Active: Type Advantage (+10% Dmg)"];
    ['inf','cav','arc'].forEach(u => {
        const w = proc.weights[u];
        if (w.t7 > 0) logs.push(`Requirement Tier 7+ (${u}): ${(w.t7*100).toFixed(0)}% Efficient`);
        if (w.tg3 > 0) logs.push(`Requirement TG3/5 (${u}): ${(w.tg3*100).toFixed(0)}% Effective`);
    });
    side.heroes.forEach((h, i) => {
        if (h.name === "None") return;
        const d = HEROES[h.name]; starBonus += GROWTH_TEMPLATES[d.template][(h.star * 6) + h.sub] || 0;
        const skills = (i < 3) ? d.skills : [d.skills[0]];
        skills.forEach((s, si) => {
            if (s.group !== type && s.group !== 'den') return;
            const x = s.values[h['s'+(si+1)]-1];
            const p = shiftFn(s.getChance(x), luckMode);
            const m = s.getMagnitude(x);
            let ev = Array.isArray(m) ? m.map(v => s.duration === 0 ? p * v : (1 - Math.pow(1 - p, s.duration)) * v) : (s.duration === 0 ? p * m : (1 - Math.pow(1 - p, s.duration)) * m);
            s.ids.forEach((id, idx) => pools[id] = (pools[id] || 0) + (Array.isArray(ev) ? ev[idx] : ev));
            if (luckMode === 'average') logs.push(`${h.name}: ${s.name} (+${((Array.isArray(ev)?ev[0]:ev)*100).toFixed(1)}%)`);
        });
    });
    let mult = 1.0; Object.values(pools).forEach(v => mult *= (1+v));
    return { units: {inf:mult,cav:mult,arc:mult}, star: starBonus, logs };
}

function isAlive(a) { return (a.inf + a.cav + a.arc) > 1; }
