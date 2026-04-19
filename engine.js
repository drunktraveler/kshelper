import { UNITS } from './units.js';
import { HEROES } from './heroes.js';
import { GROWTH_TEMPLATES } from './constants.js';

export function runCombatSim(setup) {
    const atkProc = processBatches(setup.atk.batches);
    const defProc = processBatches(setup.def.batches);

    let m_cur = { ...atkProc.counts };
    let e_cur = { ...defProc.counts };

    const totalAtkArmy = Object.values(m_cur).reduce((a, b) => a + b, 0);
    const totalDefArmy = Object.values(e_cur).reduce((a, b) => a + b, 0);
    const sq_min = Math.sqrt(Math.min(totalAtkArmy, totalDefArmy));

    const m_skill_mults = getMultipliers(setup.atk, atkProc, 'num');
    const e_skill_mults = getMultipliers(setup.def, defProc, 'den');

    const m_widget = 0;
    const e_widget = 0;

    let wave = 0;
    while (isAlive(m_cur) && isAlive(e_cur)) {
        wave++;
        const m_f_long = ['infantry', 'cavalry', 'archers'].find(u => m_cur[u.slice(0,3)] > 1) || 'archers';
        const e_f_long = ['infantry', 'cavalry', 'archers'].find(u => e_cur[u.slice(0,3)] > 1) || 'archers';
        const mf = m_f_long.slice(0, 3), ef = e_f_long.slice(0, 3);
        let pending = [];

        [['atk', 'def'], ['def', 'atk']].forEach(([side, target]) => {
            const s_p = side === 'atk' ? atkProc : defProc;
            const t_p = side === 'atk' ? defProc : atkProc;
            const s_cur = side === 'atk' ? m_cur : e_cur, t_cur = side === 'atk' ? e_cur : m_cur;
            const s_setup = setup[side], t_setup = setup[target];
            const sf = side === 'atk' ? mf : ef, tf = side === 'atk' ? ef : mf;
            
            const s_mod_obj = side === 'atk' ? m_skill_mults : e_skill_mults;
            const t_mod_obj = side === 'atk' ? e_skill_mults : m_skill_mults;
            const s_wid = side === 'atk' ? m_widget : e_widget, t_wid = side === 'atk' ? e_widget : m_widget;

            ['inf', 'cav', 'arc'].forEach(u => {
                if (s_cur[u] <= 0) return;

                const b = s_p.avgBase[u], tb = t_p.avgBase[tf];
                let atk = b.atk * (1 + (s_setup.stats[`${u}_att`] + s_mod_obj.star) / 100);
                let leth = b.leth * (1 + s_setup.stats[`${u}_leth`] / 100);
                let df = tb.def * (1 + (t_setup.stats[`${tf}_def`] + t_mod_obj.star) / 100);
                let hp = tb.hp * (1 + t_setup.stats[`${tf}_hp`] / 100);

                // 1. Always Active (Master Brawler / Charge / Ranged Strike)
                let type_m = ((u === 'inf' && tf === 'cav') || (u === 'cav' && tf === 'arc') || (u === 'arc' && tf === 'inf')) ? 1.1 : 1.0;

                // 2. Tier 7+ Abilities (Weighted)
                let tier_abil = 1.0;
                const t7w = s_p.weights[u].t7;
                if (u === 'arc') tier_abil *= (1 + (0.10 * t7w)); // Volley
                if (tf === 'inf' && u === 'cav') df *= (1 + (0.10 * t_p.weights.inf.t7)); // Bands of Steel weight on defender

                // 3. TG Abilities (Weighted - TG5 replaces TG3)
                let tg_val = 0;
                const w3 = s_p.weights[u].tg3, w5 = s_p.weights[u].tg5;
                if (u === 'arc' || u === 'cav') {
                    // Logic: TG5 troops give 15%, TG3-only troops give 10%
                    tg_val = (w5 * 0.15) + ((w3 - w5) * 0.10);
                    tier_abil *= (1 + tg_val);
                }
                if (tf === 'inf') {
                    const tw3 = t_p.weights.inf.tg3, tw5 = t_p.weights.inf.tg5;
                    // Mitigation Logic: TG5 = 13.5% Mit, TG3 = 9% Mit
                    const effectiveMit = (tw5 * 0.135) + ((tw3 - tw5) * 0.09);
                    tier_abil *= (1 - effectiveMit);
                }

                const s_mod = (s_mod_obj.units[u] || 1) * s_wid;
                const t_mod = (t_mod_obj.units[tf] || 1) * t_wid;

                // 4. Cavalry Bypass (Ambusher - Efficiency affects the split)
                if (u === 'cav' && t_cur['arc'] > 1 && tf !== 'arc' && t7w > 0) {
                    const bypassRate = 0.20 * t7w; 
                    const f_dmg = (Math.sqrt(s_cur[u]) * sq_min * atk * leth * type_m * tier_abil * (1 - bypassRate) * s_mod) / (df * hp * 100 * t_mod);
                    pending.push({ dict: t_cur, unit: tf, amt: f_dmg });
                    
                    const b_atk = s_p.avgBase['cav'].atk * (1 + (s_setup.stats['cav_att'] + s_mod_obj.star) / 100);
                    const b_df = t_p.avgBase['arc'].def * (1 + (t_setup.stats['arc_def'] + t_mod_obj.star) / 100);
                    const b_hp = t_p.avgBase['arc'].hp * (1 + t_setup.stats['arc_hp'] / 100);
                    const b_dmg = (Math.sqrt(s_cur[u]) * sq_min * b_atk * leth * 1.1 * tier_abil * bypassRate * s_mod) / (b_df * b_hp * 100 * (t_mod_obj.units['arc'] * t_wid));
                    pending.push({ dict: t_cur, unit: 'arc', amt: b_dmg });
                } else {
                    if (u === 'cav' && tf === 'arc') tier_abil *= 0.8;
                    const kills = (Math.sqrt(s_cur[u]) * sq_min * atk * leth * type_m * tier_abil * s_mod) / (df * hp * 100 * t_mod);
                    pending.push({ dict: t_cur, unit: tf, amt: kills });
                }
            });
        });
        pending.forEach(p => p.dict[p.unit] = Math.max(0, p.dict[p.unit] - p.amt));
    }
    return { m_cur, e_cur, wave, atk_mults: m_skill_mults.logs, def_mults: e_skill_mults.logs };
}

function processBatches(batches) {
    let totals = { inf: 0, cav: 0, arc: 0 };
    let avgBase = {
        inf: { atk: 0, def: 0, leth: 0, hp: 0 },
        cav: { atk: 0, def: 0, leth: 0, hp: 0 },
        arc: { atk: 0, def: 0, leth: 0, hp: 0 }
    };
    let weights = {
        inf: { t7: 0, tg3: 0, tg5: 0 },
        cav: { t7: 0, tg3: 0, tg5: 0 },
        arc: { t7: 0, tg3: 0, tg5: 0 }
    };

    batches.forEach(b => {
        ['inf', 'cav', 'arc'].forEach(u => {
            const longU = u === 'arc' ? 'archers' : (u === 'inf' ? 'infantry' : 'cavalry');
            const stats = UNITS[longU][b.tier][b.tg];
            const count = b[u];
            totals[u] += count;
            avgBase[u].atk += stats[0] * count;
            avgBase[u].def += stats[1] * count;
            avgBase[u].leth += stats[2] * count;
            avgBase[u].hp += stats[3] * count;

            if (b.tier >= 7) weights[u].t7 += count;
            if (b.tg >= 3) weights[u].tg3 += count;
            if (b.tg >= 5) weights[u].tg5 += count;
        });
    });

    ['inf', 'cav', 'arc'].forEach(u => {
        if (totals[u] > 0) {
            avgBase[u].atk /= totals[u];
            avgBase[u].def /= totals[u];
            avgBase[u].leth /= totals[u];
            avgBase[u].hp /= totals[u];
            weights[u].t7 /= totals[u];
            weights[u].tg3 /= totals[u];
            weights[u].tg5 /= totals[u];
        }
    });

    return { counts: totals, avgBase, weights };
}

function getMultipliers(side, proc, type) {
    let pools = {}, starBonus = 0, logs = [];

    logs.push("Always Active: Counter-Type Strike (+10% Dmg)");

    ['inf', 'cav', 'arc'].forEach(u => {
        const w = proc.weights[u];
        if (w.t7 > 0) logs.push(`Requirement Tier 7+ (${u}): ${(w.t7 * 100).toFixed(0)}% Effective`);
        if (w.tg3 > 0) logs.push(`Requirement TG3/5 (${u}): ${(w.tg3 * 100).toFixed(0)}% Effective`);
    });

    side.heroes.forEach((h, i) => {
        if (h.name === "None") return;
        const d = HEROES[h.name];
        starBonus += GROWTH_TEMPLATES[d.template][(h.star * 6) + h.sub] || 0;
        const skills = (i < 3) ? d.skills : [d.skills[0]];
        skills.forEach((s, sIdx) => {
            if (s.group !== type && s.group !== 'den') return;
            const X = s.values[h[`s${sIdx + 1}`] - 1];
            const p = s.getChance(X), m = s.getMagnitude(X);
            let ev = Array.isArray(m) ? m.map(v => s.duration === 0 ? p * v : (1 - Math.pow(1 - p, s.duration)) * v) : (s.duration === 0 ? p * m : (1 - Math.pow(1 - p, s.duration)) * m);
            s.ids.forEach((id, idx) => pools[id] = (pools[id] || 0) + (Array.isArray(ev) ? ev[idx] : ev));
            logs.push(`${h.name}: ${s.name} (+${((Array.isArray(ev)?ev[0]:ev)*100).toFixed(1)}%)`);
        });
    });

    let finalMult = 1.0;
    Object.values(pools).forEach(sum => finalMult *= (1 + sum));
    return { units: { inf: finalMult, cav: finalMult, arc: finalMult }, star: starBonus, logs };
}

function isAlive(a) { return (a.inf + a.cav + a.arc) > 1; }
