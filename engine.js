import { UNITS } from './units.js';
import { HEROES } from './heroes.js';
import { GROWTH_TEMPLATES } from './constants.js';

export function runCombatSim(setup, atkLuck = 'average', defLuck = 'average', nWaves = 100, isBear = false) {
    const atkP = processBatches(setup.atk.batches);
    // Bear Trap Defender Override
    const defP = isBear ? {
        counts: { inf: 1000000000, cav: 0, arc: 0 }, // Infinity health
        avgBase: { inf: { atk: 0, def: 10, leth: 0, hp: 5000 } },
        weights: { inf: { t7: 0, tg3: 0, tg5: 0 } }
    } : processBatches(setup.def.batches);

    let m_cur = { ...atkP.counts }, e_cur = { ...defP.counts };
    const totalStartAtk = Object.values(m_cur).reduce((a, b) => a + b, 0);
    const totalStartDef = isBear ? 1 : Object.values(e_cur).reduce((a, b) => a + b, 0);
    const sq_min = Math.sqrt(Math.min(totalStartAtk, totalStartDef));

    const getShiftedProb = (p, mode, duration) => {
        if (mode === 'average' || p <= 0 || p >= 1) return p;
        // Bear Trap Override: Duration becomes 1 (no uptime shift)
        const effectiveN = isBear ? 10 : nWaves;
        const sigma = Math.sqrt((p * (1 - p)) / effectiveN);
        return mode === 'lucky' ? Math.min(1, p + 1.0 * sigma) : Math.max(0, p - 1.0 * sigma);
    };

    // Skills: isBear forces durations to 0 (1 wave)
    const m_skill = getMultipliers(setup.atk, atkP, 'num', atkLuck, getShiftedProb, 'atk', isBear);
    const e_skill = isBear ? { units: { inf: 1, cav: 1, arc: 1 }, star: 0, logs: [] } : getMultipliers(setup.def, defP, 'den', defLuck, getShiftedProb, 'def', false);
    
    const widget_mult = Math.pow(1.15, 3);

    let wave = 0;
    let totalDmg = 0;
    const maxWaves = isBear ? 10 : 2000;
    
     while (isAlive(m_cur) && (isBear || isAlive(e_cur)) && wave < maxWaves) {
        wave++;
        if (atkLuck === 'stochastic') {
            ['atk', 'def'].forEach(s => { for (let id in activeBuffs[s]) if (activeBuffs[s][id] > 0) activeBuffs[s][id]--; });
        }

        const mf = (['infantry','cavalry','archers'].find(u => m_cur[u.slice(0,3)] > 1) || 'archers').slice(0,3);
        const ef = (['infantry','cavalry','archers'].find(u => e_cur[u.slice(0,3)] > 1) || 'archers').slice(0,3);
        let pending = [];

        [['atk', 'def'], ['def', 'atk']].forEach(([side, target]) => {
            const sP = side==='atk'?atkP:defP, tP = side==='atk'?defP:atkP;
            const sC = side==='atk'?m_cur:e_cur, tC = side==='atk'?e_cur:m_cur;
            const sS = setup[side], tS = setup[target];
            const tf = side==='atk'?ef:mf;
            const sMod = side==='atk'?m_skill_base:e_skill_base;
            const tMod = side==='atk'?e_skill_base:m_skill_base;
            const sL = side==='atk'?atkLuck:defLuck;

            let wave_s_mult = 1.0, pools = {};
            sS.heroes.forEach((h, i) => {
                if (h.name === "None") return;
                const d = HEROES[h.name];
                const skills = (i < 3) ? d.skills : [d.skills[0]];
                skills.forEach((s, si) => {
                    if (s.group !== (side === 'atk' ? 'num' : 'den')) return;
                    const x = s.values[h[`s${si+1}`]-1];
                    const p = getProb(s.getChance(x), side, `${h.name}_${si}`, s.duration, sL);
                    if (p >= 1) {
                        const m = s.getMagnitude(x);
                        s.ids.forEach((id, idx) => pools[id] = (pools[id] || 0) + (Array.isArray(m) ? m[idx] : m));
                    }
                });
            });
            Object.values(pools).forEach(v => wave_s_mult *= (1+v));

            ['inf', 'cav', 'arc'].forEach(u => {
                if (sC[u] <= 0) return;
                const b = sP.avgBase[u], tb = tP.avgBase[tf];
                let atk = b.atk * (1 + (sS.stats[u+'_att'] + sMod.star)/100);
                let leth = b.leth * (1 + sS.stats[u+'_leth']/100);
                let df = tb.def * (1 + (tS.stats[tf+'_def'] + tMod.star)/100);
                let hp = tb.hp * (1 + tS.stats[tf+'_hp']/100);
                let tm = ((u==='inf'&&tf==='cav')||(u==='cav'&&tf==='arc')||(u==='arc'&&tf==='inf'))?1.1:1.0;
                
                const tShift = (p) => getProb(p, side, u+'_abil', 0, sL);
                let abil = 1.0;
                if (u==='arc') abil *= (1 + tShift(0.1*sP.weights.arc.t7)) * (1 + (tShift(sP.weights.arc.tg5?0.3:(sP.weights.arc.tg3?0.2:0))*0.5));
                if (u==='cav') abil *= (1 + tShift(sP.weights.cav.tg5?0.15:(sP.weights.cav.tg3?0.1:0)));
                if (tf==='inf') { 
                    if (u==='cav') df *= (1 + (0.1*tP.weights.inf.t7));
                    abil *= (1 - (tShift(tP.weights.inf.tg5?0.375:(tP.weights.inf.tg3?0.25:0))*0.36));
                }

                const sM = wave_s_mult * widget_mult, tM = (tMod.units[tf] || 1.5) * widget_mult;

                if (u === 'cav' && tC['arc'] > 1 && tf !== 'arc' && sP.weights.cav.t7 > 0) {
                    const bypass = tShift(0.2 * sP.weights.cav.t7);
                    pending.push({dict: tC, unit: tf, amt: (Math.sqrt(sC[u])*sq_min*atk*leth*tm*abil*(1-bypass)*sM)/(df*hp*100*tM)});
                    const ba = tP.avgBase['arc'];
                    const aD = (tS.stats['arc_def'] + tMod.star)/100;
                    pending.push({dict: tC, unit: 'arc', amt: (Math.sqrt(sC[u])*sq_min*atk*leth*1.1*abil*bypass*sM)/( (ba.def*(1+aD)) * (ba.hp*(1+tS.stats.arc_hp/100)) * 100 * (tMod.units.arc * widget_mult))});
                } else {
                    if (u === 'cav' && tf === 'arc') abil *= 0.8;
                    pending.push({dict: tC, unit: tf, amt: (Math.sqrt(sC[u])*sq_min*atk*leth*tm*abil*sM)/(df*hp*100*tM)});
                }
            });
        });
        pending.forEach(p => p.dict[p.unit] = Math.max(0, p.dict[p.unit] - p.amt));
    }
    return { m_cur, e_cur, wave, totalDmg, atk_mults: m_skill.logs, def_mults: e_skill.logs, startAtk: totalStartAtk, startDef: totalStartDef };
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
    ['inf','cav','arc'].forEach(u => { if (totals[u]>0) { Object.keys(avgBase[u]).forEach(k => avgBase[u][k] /= totals[u]); Object.keys(weights[u]).forEach(k => weights[u][k] /= totals[u]); } });
    return { counts: totals, avgBase, weights };
}

function getMultipliers(side, proc, type, luckMode, shiftFn, sideKey, isBear) {
    let pools = {}, starBonus = 0, logs = [];
     side.heroes.forEach((h, i) => {
        if (h.name === "None") return;
        const d = HEROES[h.name];
        const r = roster[h.name]; // Pull from user's roster
        
        // Widget logic: Is it active in this context?
        const hWidget = (d.widget && d.widget.context === (sideKey === 'atk' ? 'off' : 'def')) 
            ? (1 + WIDGET_GROWTH[r.widget]) 
            : 1.0;

        const skills = (i < 3) ? d.skills : [d.skills[0]];
        skills.forEach((s, si) => {
            if (s.group !== type && s.group !== 'den') return;
            const x = s.values[h[`s${si+1}`]-1];
            const p = shiftFn ? shiftFn(s.getChance(x), luckMode) : s.getChance(x);
            const m = s.getMagnitude(x);
            
            let ev = Array.isArray(m) ? m.map(v => s.duration === 0 ? p * v : (1 - Math.pow(1 - p, s.duration)) * v) : (s.duration === 0 ? p * m : (1 - Math.pow(1 - p, s.duration)) * m);
            
            s.ids.forEach((id, idx) => {
                pools[id] = (pools[id] || 0) + ((Array.isArray(ev) ? ev[idx] : ev) * hWidget);
            });
        });
    });

    let mult = 1.0;
    Object.values(pools).forEach(v => mult *= (1+v));
    return { units: {inf:mult,cav:mult,arc:mult}, star: 0, logs };
}

function isAlive(a) { return (a.inf + a.cav + a.arc) > 1; }
