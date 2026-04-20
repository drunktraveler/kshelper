import { UNITS } from './units.js';
import { HEROES } from './heroes.js';
import { GROWTH_TEMPLATES, WIDGET_GROWTH } from './constants.js';

export function runCombatSim(setup, atkLuck = 'average', defLuck = 'average', nWaves = 100, isBear = false) {
    const atkP = processBatches(setup.atk.batches);
    const defP = isBear ? {
        counts: { inf: 1000000000, cav: 0, arc: 0 },
        avgBase: { inf: { atk: 0, def: 10, leth: 0, hp: 5000 }, cav: {atk:0,def:0,leth:0,hp:0}, arc: {atk:0,def:0,leth:0,hp:0} },
        weights: { inf: { t7: 0, tg3: 0, tg5: 0 }, cav: {t7:0,tg3:0,tg5:0}, arc: {t7:0,tg3:0,tg5:0} }
    } : processBatches(setup.def.batches);

    let m_cur = { ...atkP.counts }, e_cur = { ...defP.counts };
    const totalStartAtk = Object.values(m_cur).reduce((a, b) => a + b, 0);
    const totalStartDef = isBear ? 1 : Object.values(e_cur).reduce((a, b) => a + b, 0);
    const sq_min = Math.sqrt(Math.min(totalStartAtk, totalStartDef || 1));

    const shift = (p, mode) => {
        if (mode === 'average' || p <= 0 || p >= 1) return p;
        const sigma = Math.sqrt((p * (1 - p)) / nWaves);
        return mode === 'lucky' ? Math.min(1, p + 1.0 * sigma) : Math.max(0, p - 1.0 * sigma);
    };

    const m_skill = getMultipliers(setup.atk, atkP, 'num', atkLuck, shift, isBear);
    const e_skill = isBear ? { units: {inf:1,cav:1,arc:1}, star: 0, logs: [] } : getMultipliers(setup.def, defP, 'den', defLuck, shift, false);
    const widget_mult = Math.pow(1.15, 3);

    let wave = 0, totalDmg = 0;
    const maxWaves = isBear ? 10 : 2000;

    while (isAlive(m_cur) && (isBear || isAlive(e_cur)) && wave < maxWaves) {
        wave++;
        const mf = (['infantry','cavalry','archers'].find(u => m_cur[u.slice(0,3)] > 1) || 'archers').slice(0,3);
        const ef = (['infantry','cavalry','archers'].find(u => e_cur[u.slice(0,3)] > 1) || 'archers').slice(0,3);
        let pending = [];

        [['atk', 'def'], ['def', 'atk']].forEach(([side, target]) => {
            if (isBear && side === 'def') return; 
            const sP = (side==='atk'?atkP:defP), tP = (side==='atk'?defP:atkP);
            const sC = (side==='atk'?m_cur:e_cur), tC = (side==='atk'?e_cur:m_cur);
            const sS = setup[side], tS = setup[target];
            const tf = (side==='atk'?ef:mf);
            const sMod = (side==='atk'?m_skill:e_skill);
            const tMod = (side==='atk'?e_skill:m_skill);

            ['inf', 'cav', 'arc'].forEach(u => {
                if (sC[u] <= 0) return;
                const b = sP.avgBase[u], tb = tP.avgBase[tf];
                let atk = b.atk * (1 + (sS.stats[u+'_att'] + sMod.star)/100);
                let leth = b.leth * (1 + sS.stats[u+'_leth']/100);
                let df = tb.def * (1 + (tS.stats[tf+'_def'] + tMod.star)/100);
                let hp = tb.hp * (1 + tS.stats[tf+'_hp']/100);

                let tm = ((u==='inf'&&tf==='cav')||(u==='cav'&&tf==='arc')||(u==='arc'&&tf==='inf'))?1.1:1.0;
                let abil = 1.0;
                const w = sP.weights[u];
                if (u==='arc') abil *= (1 + (0.1*w.t7)) * (1 + ((w.tg5?0.3:(w.tg3?0.2:0))*0.5));
                if (u==='cav') abil *= (1 + (w.tg5?0.15:(w.tg3?0.1:0)));
                if (tf==='inf') { 
                    if (u==='cav') df *= (1 + (0.1*tP.weights.inf.t7));
                    abil *= (1 - ((tP.weights.inf.tg5?0.375:(tP.weights.inf.tg3?0.25:0))*0.36));
                }

                const sM = sMod.units[u] * widget_mult;
                const kills = (Math.sqrt(sC[u])*sq_min*atk*leth*tm*abil*sM)/(df*hp*100);
                pending.push({dict: tC, unit: tf, amt: kills});
                if (side === 'atk') totalDmg += kills;
            });
        });
        pending.forEach(p => p.dict[p.unit] = Math.max(0, p.dict[p.unit] - p.amt));
    }
    return { m_cur, e_cur, wave, totalDmg, atk_mults: m_skill.logs, def_mults: e_skill.logs, startAtk: totalStartAtk, startDef: totalStartDef };
}

function getMultipliers(side, proc, type, luckMode, shiftFn, isBear) {
    let pools = {}, starBonus = 0, logs = ["Always Active: Type Advantage (+10% Dmg)"];
    
    // Group identical heroes for independent proc logic
    const heroGroups = {};
    side.heroes.forEach((h, i) => {
        if (h.name === "None") return;
        if (!heroGroups[h.name]) heroGroups[h.name] = { count: 0, data: h, isLeader: false };
        heroGroups[h.name].count++;
        if (i < 3) heroGroups[h.name].isLeader = true;
        // Star bonus is additive across all unique heroes
        if (i < 3 || heroGroups[h.name].count === 1) {
            starBonus += GROWTH_TEMPLATES[HEROES[h.name].template][(h.star * 6) + h.sub] || 0;
        }
    });

    for (const name in heroGroups) {
        const group = heroGroups[name];
        const d = HEROES[name];
        const hWidget = (d.widget && d.widget.context === (type === 'num' ? 'off' : 'def')) ? (1 + WIDGET_GROWTH[group.data.widgetLv]) : 1.0;

        d.skills.forEach((s, si) => {
            if (s.group !== type && s.group !== 'den') return;
            const x = s.values[group.data[`s${si+1}`]-1];
            let p = s.getChance(x);
            if (shiftFn) p = shiftFn(p, luckMode);

            // INDEPENDENCE RULE: 1 - (1-p)^n
            // Leaders use all 3 skills. Joiners (or duplicates) only contribute to Skill 1.
            let effectiveP = p;
            if (si === 0) {
                effectiveP = 1 - Math.pow(1 - p, group.count);
            } else if (!group.isLeader) {
                return; // Skill 2/3 only for leaders
            }

            const m = s.getMagnitude(x);
            const effDur = isBear ? 0 : s.duration;
            let ev = Array.isArray(m) 
                ? m.map(v => effDur === 0 ? effectiveP * v : (1 - Math.pow(1 - effectiveP, effDur)) * v) 
                : (effDur === 0 ? effectiveP * m : (1 - Math.pow(1 - effectiveP, effDur)) * m);
            
            s.ids.forEach((id, idx) => {
                pools[id] = (pools[id] || 0) + ((Array.isArray(ev) ? ev[idx] : ev) * hWidget);
            });
            if (luckMode === 'average') logs.push(`${name} (x${group.count}): ${s.name} (+${((Array.isArray(ev)?ev[0]:ev)*100).toFixed(1)}%)`);
        });
    }

    let mult = 1.0;
    Object.values(pools).forEach(v => mult *= (1+v));
    return { units: {inf:mult,cav:mult,arc:mult}, star: starBonus, logs };
}

export function isAlive(a) { return ((a.inf || 0) + (a.cav || 0) + (a.arc || 0)) > 1; }
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
