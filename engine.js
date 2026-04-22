import { UNITS } from './units.js';
import { HEROES } from './heroes.js';
import { GROWTH_TEMPLATES, WIDGET_GROWTH } from './constants.js';

export function isAlive(a) { return ((a.inf || 0) + (a.cav || 0) + (a.arc || 0)) > 1; }

export function runCombatSim(setup, atkLuck = 'average', defLuck = 'average', nWaves = 100, isBear = false, isOptimizing = false) {
    const isStochastic = (atkLuck === 'stochastic');
    const atkP = processBatches(setup.atk.batches);
    
    // Bear Trap Config: 10 Defense, 83.3333 Health
    const defP = isBear ? {
        counts: { inf: 1000000, cav: 0, arc: 0 },
        avgBase: { 
            inf: { atk: 0, def: 10, leth: 10, hp: 83.3333 },
            cav: { atk: 0, def: 0, leth: 0, hp: 0 },
            arc: { atk: 0, def: 0, leth: 0, hp: 0 }
        },
        weights: { inf: { t7: 1, tg3: 0, tg5: 0 }, cav: {t7:0,tg3:0,tg5:0}, arc: {t7:0,tg3:0,tg5:0} }
    } : processBatches(setup.def.batches);

    let m_cur = { ...atkP.counts }, e_cur = { ...defP.counts };
    const totalStartAtk = Object.values(m_cur).reduce((a, b) => a + b, 0);
    const totalStartDef = isBear ? 1000000 : Object.values(e_cur).reduce((a, b) => a + b, 0);
    const sq_min = Math.sqrt(Math.min(totalStartAtk, totalStartDef));

    const shift = (p, mode) => {
    if (mode === 'average' || p <= 0 || p >= 1) return p;
    // We use nWaves to determine the variance over the course of the whole fight
    const sigma = Math.sqrt((p * (1 - p)) / nWaves); 
    return mode === 'lucky' ? Math.min(1, p + 1.96 * sigma) : Math.max(0, p - 1.96 * sigma);
    };

    const m_skill = getMultipliers(setup.atk, atkP, 'num', atkLuck, shift, 'atk', isBear);
    const e_skill = isBear ? { units: {all:1}, star: 0, logs: [] } : getMultipliers(setup.def, defP, 'den', defLuck, shift, 'def', false);

    let wave = 0, totalDmg = 0;
    const maxWaves = isBear ? 1 : 2000;

    while (isAlive(m_cur) && (isBear || isAlive(e_cur)) && wave < maxWaves) {
        wave++;
        const mf = (['infantry','cavalry','archers'].find(u => m_cur[u.slice(0,3)] > 1) || 'archers').slice(0,3);
        const ef = (['infantry','cavalry','archers'].find(u => e_cur[u.slice(0,3)] > 1) || 'archers').slice(0,3);
        let pending = [];

        [['atk', 'def'], ['def', 'atk']].forEach(([side, target]) => {
            if (isBear && side === 'def') return; 
            const sP = (side==='atk'?atkP:defP), tP = (side==='atk'?defP:atkP), sC = (side==='atk'?m_cur:e_cur), tC = (side==='atk'?e_cur:m_cur);
            const sS = setup[side], tS = setup[target], tf = (side==='atk'?ef:mf), sMod = (side==='atk'?m_skill:e_skill);
            const sL = (side==='atk'?atkLuck:defLuck);

            ['inf', 'cav', 'arc'].forEach(u => {
                if (sC[u] <= 0) return;
                const b = sP.avgBase[u], tb = tP.avgBase[tf];
                let atk = b.atk * (1 + (sS.stats[u+'_att'] + sMod.star)/100), leth = b.leth * (1 + sS.stats[u+'_leth']/100);
                let df = tb.def * (1 + (tS.stats[tf+'_def'] + (side==='atk'?e_skill.star:m_skill.star))/100), hp = tb.hp * (1 + tS.stats[tf+'_hp']/100);

                let interaction = 1.0;
                if (u==='inf' && tf==='cav') interaction = 1.1;
                if (u==='cav' && tf==='arc') interaction = 1.1;
                if (u==='arc' && tf==='inf') interaction = 1.1;

                let abil = 1.0; const w = sP.weights[u];
                const tSht = (p) => isStochastic ? (Math.random() < p ? 1 : 0) : shift(p, sL);
                if (u==='arc') { if (w.t7 > 0) abil *= (1 + (tSht(0.1) * w.t7)); const windP = w.tg5 ? 0.3 : (w.tg3 ? 0.2 : 0); if (windP > 0) abil *= (1 + (tSht(windP) * 0.5)); }
                if (u==='cav') { const lanceP = w.tg5 ? 0.15 : (w.tg3 ? 0.1 : 0); if (lanceP > 0) abil *= (1 + tSht(lanceP)); }
                if (tf==='inf') { const tw = tP.weights.inf; if (u==='cav' && tw.t7 > 0) df *= (1 + (0.1 * tw.t7)); const shieldP = tw.tg5 ? 0.375 : (tw.tg3 ? 0.25 : 0); if (shieldP > 0) abil *= (1 - (tSht(shieldP) * 0.36)); }

                let kills;
                if (isBear) {
                    // Fix: Define the missing wave_s_mult (usually 1.0 for the simulation start)
                    // and ensure the formula uses the values correctly.
                    const bear_scaling = 1.0; 
                    kills = sq_min * Math.sqrt(sC[u]) * (atk/100) * (leth/100) * interaction * abil * bear_scaling * 1.25;
                    totalDmg += kills;
                } else {
                    kills = (Math.sqrt(sC[u])*sq_min*atk*leth*interaction*abil*sMod.units.all*Math.pow(1.15,3))/(df*hp*100);
                }
                pending.push({dict: tC, unit: tf, amt: kills});
            });
        });
        if (!isBear) pending.forEach(p => p.dict[p.unit] = Math.max(0, p.dict[p.unit] - p.amt));
    }

    if (!isOptimizing && !isBear) {
        const mS = Object.values(m_cur).reduce((a,b)=>a+b, 0), eS = Object.values(e_cur).reduce((a,b)=>a+b, 0);
        if (mS > eS) { for(let k in e_cur) e_cur[k] = 0; } else if (eS > mS) { for(let k in m_cur) m_cur[k] = 0; }
    }
    return { m_cur, e_cur, wave, totalDmg: totalDmg * 10, atk_mults: m_skill.logs, def_mults: e_skill.logs, startAtk: totalStartAtk, startDef: totalStartDef };
}

function processBatches(batches) {
    let totals = {inf:0,cav:0,arc:0}, avgBase = {inf:{atk:0,def:0,leth:0,hp:0},cav:{atk:0,def:0,leth:0,hp:0},arc:{atk:0,def:0,leth:0,hp:0}};
    let weights = {inf:{t7:0,tg3:0,tg5:0},cav:{t7:0,tg3:0,tg5:0},arc:{t7:0,tg3:0,tg5:0}};
    batches.forEach(b => {
        ['inf','cav','arc'].forEach(u => {
            const longU = u==='arc'?'archers':(u==='inf'?'infantry':'cavalry'), stats = UNITS[longU][b.tier][b.tg];
            totals[u] += b[u]; avgBase[u].atk += stats[0]*b[u]; avgBase[u].def += stats[1]*b[u]; avgBase[u].leth += stats[2]*b[u]; avgBase[u].hp += stats[3]*b[u];
            if (b.tier >= 7) weights[u].t7 += b[u]; if (b.tg >= 3) weights[u].tg3 += b[u]; if (b.tg >= 5) weights[u].tg5 += b[u];
        });
    });
    ['inf','cav','arc'].forEach(u => { if (totals[u]>0) { Object.keys(avgBase[u]).forEach(k => avgBase[u][k] /= totals[u]); Object.keys(weights[u]).forEach(k => weights[u][k] /= totals[u]); } });
    return { counts: totals, avgBase, weights };
}

function getMultipliers(side, proc, type, luckMode, shiftFn, sideKey, isBear) {
    let pools = {}, starBonus = 0, logs = [];
    const isStochastic = (luckMode === 'stochastic');
    
    // 1. Log Troop Abilities
    ['inf','cav','arc'].forEach(u => {
        const w = proc.weights[u];
        if (w.t7 > 0) logs.push(`Requirement Tier 7+ (${u}): ${(w.t7*100).toFixed(0)}% Effective`);
        if (w.tg3 > 0) logs.push(`Requirement TG3/5 (${u}): ${(w.tg3*100).toFixed(0)}% Effective`);
    });

    const isSolo = sideKey === 'atk' && side.batches.length === 1 && !isBear;

    // 2. Count ALL copies of every hero in the 7-man lineup
    const heroCounts = {};
    side.heroes.forEach(h => { if(h.name !== "None") heroCounts[h.name] = (heroCounts[h.name]||0)+1; });

    const p = s.getChance(x);
    const m = s.getMagnitude(x);
    
    let ev, triggerCount = 0;
    if (p >= 1.0) {
        ev = Array.isArray(m) ? m.map(v => n * v) : n * m;
    } else if (isStochastic) {
        // Roll for every wave and every hero/type independently
        // We simulate the rolls for the duration of the fight to get a trigger count
        for(let i=0; i < n * 100; i++) { // Sample over 100 "ticks"
            if (Math.random() < p) triggerCount++;
        }
        const actualRate = triggerCount / (n * 100);
        ev = Array.isArray(m) ? m.map(v => actualRate * v) : actualRate * m;
    } else {
        const prob = shiftFn(p, luckMode);
        ev = Array.isArray(m) ? m.map(v => prob * v) : prob * m;
    }

    // Log with trigger counts for Monte Carlo
    if (isStochastic) {
        logs.push(`${name}: ${s.name} (Triggered ${triggerCount} times)`);
    } else {
        logs.push(`${name}: ${s.name} (+${((Array.isArray(ev)?ev[0]:ev)*100).toFixed(1)}%)`);
    }

    Object.keys(heroCounts).forEach(name => {
        const d = HEROES[name];
        const h = side.heroes.find(x => x.name === name);
        starBonus += (h.starBonus || 0);
        const widgetLv = h.widgetLv || 0;
        const hWidget = (d.widget && d.widget.context === (sideKey==='atk'?'off':'def') && !isSolo) ? (1 + WIDGET_GROWTH[widgetLv]) : 1.0;

        // 3. Process Skills
        d.skills.forEach((s, si) => {
            if (s.group !== type && s.group !== 'den') return;
            const x = s.values[h[`s${si+1}`]-1];
            const p = shiftFn ? shiftFn(s.getChance(x), luckMode) : s.getChance(x);
            const m = s.getMagnitude(x);
            const effDur = isBear ? 0 : s.duration;

            // Independence Rule: Applies to Skill 1 for everyone. Skill 2/3 only for Leaders (count=1).
            // If the hero is a Leader, their count is the total (L+J). If only a Joiner, count is J.
            const isLeaderSlot = side.heroes.slice(0,3).some(lh => lh.name === name);
            if (!isLeaderSlot && si > 0) return; // Only leaders provide S2/S3

            const n = (si === 0) ? heroCounts[name] : 1;
            
            let ev;
            if (p >= 1.0) {
                // Passives stack additively
                ev = Array.isArray(m) ? m.map(v => n * v) : n * m;
            } else {
                // Chance-based independence
                const pAny = 1 - Math.pow(1 - p, n);
                ev = Array.isArray(m) ? m.map(v => effDur === 0 ? pAny * v : (1 - Math.pow(1 - pAny, effDur)) * v) : (effDur === 0 ? pAny * m : (1 - Math.pow(1 - pAny, effDur)) * m);
            }

            s.ids.forEach((id, idx) => pools[id] = (pools[id] || 0) + ((Array.isArray(ev) ? ev[idx] : ev) * hWidget));
            // Always push logs if we are in Average mode so the user can see them
            if (luckMode === 'average') logs.push(`${name} (x${n}): ${s.name} (+${((Array.isArray(ev)?ev[0]:ev)*100).toFixed(1)}%)`);
        });
    });

    let mult = 1.0; Object.values(pools).forEach(v => mult *= (1+v));
    return { units: {all:mult}, star: starBonus, logs };
}


