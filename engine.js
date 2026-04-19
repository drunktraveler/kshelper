import { UNIT_STATS } from './units.js';
import { HEROES } from './heroes.js';

export function runCombatSim(setup) {
    // 1. Prepare Army Counts
    let m_cur = { inf: setup.atk.troops.inf, cav: setup.atk.troops.cav, arc: setup.atk.troops.arc };
    let e_cur = { inf: setup.def.troops.inf, cav: setup.def.troops.cav, arc: setup.def.troops.arc };

    const sq_min = Math.sqrt(Math.min(
        Object.values(m_cur).reduce((a, b) => a + b, 0),
        Object.values(e_cur).reduce((a, b) => a + b, 0)
    ));

    // 2. Pre-calculate Hero Skill Multipliers
    const m_skill_mults = getSkillMultipliers(setup.atk.heroes, 'num');
    const e_skill_mults = getSkillMultipliers(setup.def.heroes, 'den');

    // 3. Widget Multiplier (Original logic: 1.15 ^ active_widgets)
    const m_widget = Math.pow(1.15, setup.settings.atkWidgets || 3);
    const e_widget = Math.pow(1.15, setup.settings.defWidgets || 3);

    let wave = 0;
    while (wave < 150 && isAlive(m_cur) && isAlive(e_cur)) {
        wave++;
        
        // Find current frontline unit
        const m_f = ['inf', 'cav', 'arc'].find(u => m_cur[u] > 1) || 'arc';
        const e_f = ['inf', 'cav', 'arc'].find(u => e_cur[u] > 1) || 'arc';

        let pending = [];

        // Calculate for both sides
        [['atk', 'def'], ['def', 'atk']].forEach(([side, target]) => {
            const src_cur = side === 'atk' ? m_cur : e_cur;
            const tgt_cur = side === 'atk' ? e_cur : m_cur;
            const src_setup = setup[side];
            const tgt_setup = setup[target];
            const s_f = side === 'atk' ? m_f : e_f;
            const t_f = side === 'atk' ? e_f : m_f;
            
            const s_mults = side === 'atk' ? m_skill_mults : e_skill_mults;
            const t_mults = side === 'atk' ? e_skill_mults : m_skill_mults;
            const s_wid = side === 'atk' ? m_widget : e_widget;
            const t_wid = side === 'atk' ? e_widget : m_widget;

            ['inf', 'cav', 'arc'].forEach(u_type => {
                if (src_cur[u_type] <= 0) return;

                // Lookup Base Stats
                const base = UNIT_STATS[u_type === 'arc' ? 'archers' : u_type][src_setup.tier][src_setup.tg];
                const t_base = UNIT_STATS[t_f === 'arc' ? 'archers' : t_f][tgt_setup.tier][tgt_setup.tg];

                // Base Power Calculation
                let atk = base.atk * (1 + src_setup.stats[`${u_type}_att`] / 100);
                let leth = base.leth * (1 + src_setup.stats[`${u_type}_leth`] / 100);
                let df = t_base.def * (1 + tgt_setup.stats[`${t_f}_def`] / 100);
                let hp = t_base.hp * (1 + tgt_setup.stats[`${t_f}_hp`] / 100);

                // Type Matchups (1.1x)
                let type_m = 1.0;
                if ((u_type === 'inf' && t_f === 'cav') || (u_type === 'cav' && t_f === 'arc') || (u_type === 'arc' && t_f === 'inf')) {
                    type_m = 1.1;
                }
                if (t_f === 'inf' && u_type === 'cav') df *= 1.1;

                // TG3 Abilities EV
                let abil_m = 1.0;
                if (u_type === 'arc') abil_m *= (1.1 * 1.1); // Double Miss
                if (u_type === 'cav') abil_m *= 1.1; // Double
                if (t_f === 'inf') abil_m *= 0.91; // Block EV

                // Skill Multipliers (summed by ID then multiplied)
                const s_mod = (s_mults[u_type] || 1.0) * s_wid;
                const t_mod = (t_mults[t_f] || 1.0) * t_wid;

                // Cavalry Bypass Logic
                if (u_type === 'cav' && tgt_cur['arc'] > 1 && t_f !== 'arc') {
                    // 80% Front
                    const f_dmg = (Math.sqrt(src_cur[u_type]) * sq_min * atk * leth * type_m * abil_m * 0.8 * s_mod) / (df * hp * 100 * t_mod);
                    pending.push({ dict: tgt_cur, unit: t_f, amt: f_dmg });
                    
                    // 20% Back (Archers)
                    const a_base = UNIT_STATS['archers'][tgt_setup.tier][tgt_setup.tg];
                    const a_df = a_base.def * (1 + tgt_setup.stats['arc_def'] / 100);
                    const a_hp = a_base.hp * (1 + tgt_setup.stats['arc_hp'] / 100);
                    const a_mod = (t_mults['arc'] || 1.0) * t_wid;
                    const b_dmg = (Math.sqrt(src_cur[u_type]) * sq_min * atk * leth * 1.1 * abil_m * 0.2 * s_mod) / (a_df * a_hp * 100 * a_mod);
                    pending.push({ dict: tgt_cur, unit: 'arc', amt: b_dmg });
                } else {
                    if (u_type === 'cav' && t_f === 'arc') abil_m *= 0.8; // Miss logic
                    const kills = (Math.sqrt(src_cur[u_type]) * sq_min * atk * leth * type_m * abil_m * s_mod) / (df * hp * 100 * t_mod);
                    pending.push({ dict: tgt_cur, unit: t_f, amt: kills });
                }
            });
        });

        // Apply damage simultaneously
        pending.forEach(p => {
            p.dict[p.unit] = Math.max(0, p.dict[p.unit] - p.amt);
        });
    }

    return { m_cur, e_cur, wave };
}

function isAlive(army) {
    return (army.inf + army.cav + army.arc) > 1;
}

function getSkillMultipliers(heroSelections, groupType) {
    // groupType: 'num' for Attacker, 'den' for Defender
    let pools = {}; // { id: sum }
    
    heroSelections.forEach((h, idx) => {
        if (h.name === "None") return;
        const data = HEROES[h.name];
        const activeSkills = idx < 3 ? data.skills : [data.skills[0]];

        activeSkills.forEach((skill, sIdx) => {
            if (skill.group !== groupType) return;
            
            const level = h[`s${sIdx + 1}`];
            const X = skill.values[level - 1];
            
            // Expected Value Calculation
            const p = skill.getChance(X);
            const m = skill.getMagnitude(X);
            const ev = skill.duration === 0 ? (p * m) : (1 - Math.pow(1 - p, skill.duration)) * m;

            // Simple additive stacking by ID
            skill.ids.forEach(id => {
                pools[id] = (pools[id] || 0) + ev;
            });
        });
    });

    // Multiplicative combine: (1 + id1_sum) * (1 + id2_sum)...
    let finalMult = 1.0;
    Object.values(pools).forEach(sum => {
        finalMult *= (1 + sum);
    });
    
    // Return same mult for all units (for now, unless skill targets specific types)
    return { inf: finalMult, cav: finalMult, arc: finalMult };
}
