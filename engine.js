import { UNITS } from './units.js';
import { HEROES } from './heroes.js';
import { GROWTH_TEMPLATES } from './constants.js';

export function runCombatSim(setup, rngMode = 'average') {
    const atkP = processBatches(setup.atk.batches);
    const defP = processBatches(setup.def.batches);

    let m_cur = { ...atkP.counts }, e_cur = { ...defP.counts };
    const totalAtkArmy = Object.values(m_cur).reduce((a, b) => a + b, 0);
    const totalDefArmy = Object.values(e_cur).reduce((a, b) => a + b, 0);
    const sq_min = Math.sqrt(Math.min(totalAtkArmy, totalDefArmy));

    const m_skill = getMultipliers(setup.atk, atkP, 'num', rngMode);
    const e_skill = getMultipliers(setup.def, defP, 'den', rngMode);
    const widget_mult = Math.pow(1.15, 3);

    // Statistical Shift Helper
    const shift = (p) => {
        if (rngMode === 'average' || p <= 0 || p >= 1) return p;
        // Reduced sample size (20) to make variance more visible for the user
        const sigma = Math.sqrt(p * (1 - p) / 20); 
        return rngMode === 'lucky' ? Math.min(1, p + 1.645 * sigma) : Math.max(0, p - 1.645 * sigma);
    };

    let wave = 0;
    while (isAlive(m_cur) && isAlive(e_cur) && wave < 2000) {
        wave++;
        const mf_l = ['infantry','cavalry','archers'].find(u => m_cur[u.slice(0,3)] > 1) || 'archers';
        const ef_l = ['infantry','cavalry','archers'].find(u => e_cur[u.slice(0,3)] > 1) || 'archers';
        const mf = mf_l.slice(0, 3), ef = ef_l.slice(0, 3);
        let pending = [];

        [['atk', 'def'], ['def', 'atk']].forEach(([side, target]) => {
            const sProc = side === 'atk' ? atkP : defProc, tProc = side === 'atk' ? defP : atkP;
            const sC = side === 'atk' ? m_cur : e_cur, tC = side === 'atk' ? e_cur : m_cur;
            const sS = setup[side], tS = setup[target];
            const tf = side === 'atk' ? ef : mf;
            const sMod = side === 'atk' ? m_skill : e_skill, tMod = side === 'atk' ? e_skill : m_skill;

            ['inf', 'cav', 'arc'].forEach(u => {
                if (sC[u] <= 0) return;
                const b = sProc.avgBase[u], tb = tProc.avgBase[tf];
                
                let atk = b.atk * (1 + (sS.stats[u+'_att'] + sMod.star)/100);
                let leth = b.leth * (1 + sS.stats[u+'_leth']/100);
                let df = tb.def * (1 + (tS.stats[tf+'_def'] + tMod.star)/100);
                let hp = tb.hp * (1 + tS.stats[tf+'_hp']/100);

                let tm = ((u === 'inf' && tf === 'cav') || (u === 'cav' && tf === 'arc') || (u === 'arc' && tf === 'inf')) ? 1.1 : 1.0;
                
                // --- APPLY LUCK TO TROOP ABILITIES ---
                let abil = 1.0;
                const w = sProc.weights[u];
                if (u === 'arc') {
                    const volleyEff = shift(0.10 * w.t7);
                    const windEff = shift((w.tg5 * 0.30) + ((w.tg3 - w.tg5) * 0.20));
                    abil *= (1 + volleyEff) * (1 + (windEff * 0.50));
                }
                if (u === 'cav') {
                    const lanceEff = shift((w.tg5 * 0.15) + ((w.tg3 - w.tg5) * 0.10));
                    abil *= (1 + lanceEff);
                }
                if (tf === 'inf') {
                    const tw = tProc.weights.inf;
                    if (u === 'cav') df *= (1 + (0.1 * tw.t7));
                    const shieldEff = shift((tw.tg5 * 0.375) + ((tw.tg3 - tw.tg5) * 0.25));
                    abil *= (1 - (shieldEff * 0.36));
                }

                const sM = sMod.units[u] * widget_mult, tM = tMod.units[tf] * widget_mult;

                if (u === 'cav' && tC['arc'] > 1 && tf !== 'arc' && w.t7 > 0) {
                    const bypass = shift(0.2 * w.t7);
                    pending.push({dict: tC, unit: tf, amt: (Math.sqrt(sC[u])*sq_min*atk*leth*tm*abil*(1-bypass)*sM)/(df*hp*100*tM)});
                    const ba = tProc.avgBase['arc'];
                    pending.push({dict: tC, unit: 'arc', amt: (Math.sqrt(sC[u])*sq_min*atk*leth*1.1*abil*bypass*sM)/( (ba.def*(1+(tS.stats.arc_def+tMod.star)/100)) * (ba.hp*(1+tS.stats.arc_hp/100)) * 100 * (tMod.units.arc*widget_mult))});
                } else {
                    if (u === 'cav' && tf === 'arc') abil *= 0.8;
                    pending.push({dict: tC, unit: tf, amt: (Math.sqrt(sC[u])*sq_min*atk*leth*tm*abil*sM)/(df*hp*100*tM)});
                }
            });
        });
        pending.forEach(p => p.dict[p.unit] = Math.max(0, p.dict[p.unit] - p.amt));
    }
    return { m_cur, e_cur, wave, atk_mults: m_skill.logs, def_mults: e_skill.logs, totalAtk: totalAtkArmy };
}

function processBatches(batches) {
    let totals = {inf:0,cav:0,arc:0}, avgBase = {inf:{atk:0,def:0,leth:0,hp:0},cav:{atk:0,def:0,leth:0,hp:0},arc:{atk:0,def:0,leth:0,hp:0}};
    let weights = {inf:{t7:0,tg3:0,tg5:0},cav:{t7:0,tg3:0,tg5:0},arc:{t7:0,tg3:0,tg5:0}};
    batches.forEach(b => {
        ['inf','cav','arc'].forEach(u => {
            const longU = u==='arc'?'archers':(u==='inf'?'infantry':'cavalry');
            const stats = UNITS[longU][b.tier][b.tg];
            totals[u] += b[u]; avgBase[u].atk += stats[0]*b[u]; avgBase[u].def += stats[1]*b[u]; avgBase[u].leth += stats[2]*b[u]; avgBase[u].hp += stats[3]*b[u];
            if (b.tier >= 7) weights[u].t7 += b[u];
            if (b.tg >= 3) weights[u].tg3 += b[u];
            if (b.tg >= 5) weights[u].tg5 += b[u];
        });
    });
    ['inf','cav','arc'].forEach(u => {
        if (totals[u]>0) {
            Object.keys(avgBase[u]).forEach(k => avgBase[u][k] /= totals[u]);
            Object.keys(weights[u]).forEach(k => weights[u][k] /= totals[u]);
        }
    });
    return { counts: totals, avgBase, weights };
}

function getMultipliers(side, proc, type, rngMode) {
    let pools = {}, starBonus = 0, logs = ["Always Active: Type Advantage (+10% Dmg)"];
    const shift = (p) => {
        if (rngMode === 'average' || p <= 0 || p >= 1) return p;
        const sigma = Math.sqrt(p * (1 - p) / 20);
        return rngMode === 'lucky' ? Math.min(1, p + 1.645 * sigma) : Math.max(0, p - 1.645 * sigma);
    };
    ['inf','cav','arc'].forEach(u => {
        if (proc.weights[u].t7 > 0) logs.push(`Requirement Tier 7+ (${u}): ${(proc.weights[u].t7*100).toFixed(0)}% Effective`);
        if (proc.weights[u].tg3 > 0) logs.push(`Requirement TG3/5 (${u}): ${(proc.weights[u].tg3*100).toFixed(0)}% Effective`);
    });
    side.heroes.forEach((h, i) => {
        if (h.name === "None") return;
        const d = HEROES[h.name]; starBonus += GROWTH_TEMPLATES[d.template][(h.star*6)+h.sub] || 0;
        const skills = (i < 3) ? d.skills : [d.skills[0]];
        skills.forEach((s, si) => {
            if (s.group !== type && s.group !== 'den') return;
            const x = s.values[h['s'+(si+1)]-1];
            const p = shift(s.getChance(x)), m = s.getMagnitude(x);
            let ev = Array.isArray(m) ? m.map(v => s.duration === 0 ? p * v : (1 - Math.pow(1 - p, s.duration)) * v) : (s.duration === 0 ? p * m : (1 - Math.pow(1 - p, s.duration)) * m);
            s.ids.forEach((id, idx) => pools[id] = (pools[id] || 0) + (Array.isArray(ev) ? ev[idx] : ev));
            logs.push(`${h.name}: ${s.name} (+${((Array.isArray(ev)?ev[0]:ev)*100).toFixed(1)}%)`);
        });
    });
    let mult = 1.0; Object.values(pools).forEach(v => mult *= (1+v));
    return { units: {inf:mult,cav:mult,arc:mult}, star: starBonus, logs };
}

function isAlive(a) { return (a.inf + a.cav + a.arc) > 1; }
