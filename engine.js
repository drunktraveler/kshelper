import { UNITS } from './units.js';
import { HEROES } from './heroes.js';
import { GROWTH_TEMPLATES } from './constants.js';

export function runCombatSim(setup) {
    let m_cur = { ...setup.atk.troops };
    let e_cur = { ...setup.def.troops };
    const sq_min = Math.sqrt(Math.min(Object.values(m_cur).reduce((a, b) => a + b), Object.values(e_cur).reduce((a, b) => a + b)));

    const m_skill_mults = getMultipliers(setup.atk, 'num');
    const e_skill_mults = getMultipliers(setup.def, 'den');

    let wave = 0;
    while (wave < 150 && isAlive(m_cur) && isAlive(e_cur)) {
        wave++;
        const m_f = ['inf', 'cav', 'arc'].find(u => m_cur[u] > 1) || 'arc';
        const e_f = ['inf', 'cav', 'arc'].find(u => e_cur[u] > 1) || 'arc';
        let pending = [];

        [['atk', 'def'], ['def', 'atk']].forEach(([side, target]) => {
            const s = setup[side], t = setup[target];
            const s_cur = (side === 'atk' ? m_cur : e_cur), t_cur = (side === 'atk' ? e_cur : m_cur);
            const sf = (side === 'atk' ? m_f : e_f), tf = (side === 'atk' ? e_f : m_f);
            const s_mod = (side === 'atk' ? m_skill_mults : e_skill_mults), t_mod = (side === 'atk' ? e_skill_mults : m_skill_mults);

            ['inf', 'cav', 'arc'].forEach(u => {
                if (s_cur[u] <= 0) return;
                const b = UNITS[u === 'arc' ? 'archers' : u][s.tier][s.tg];
                const tb = UNITS[tf === 'arc' ? 'archers' : tf][t.tier][t.tg];

                let atk = b[0] * (1 + (s.stats[`${u}_att`] + s_mod.star) / 100);
                let leth = b[2] * (1 + s.stats[`${u}_leth`] / 100);
                let df = tb[1] * (1 + (t.stats[`${tf}_def`] + t_mod.star) / 100);
                let hp = tb[3] * (1 + t.stats[`${tf}_hp`] / 100);

                let tm = ((u==='inf'&&tf==='cav')||(u==='cav'&&tf==='arc')||(u==='arc'&&tf==='inf')) ? 1.1 : 1.0;
                let abil = u==='arc'?1.21 : (u==='cav'?1.1 : (tf==='inf'?0.91:1.0));

                const kills = (Math.sqrt(s_cur[u]) * sq_min * atk * leth * tm * abil * s_mod[u]) / (df * hp * 100 * t_mod[tf]);
                pending.push({ dict: t_cur, unit: tf, amt: kills });
            });
        });
        pending.forEach(p => p.dict[p.unit] = Math.max(0, p.dict[p.unit] - p.amt));
    }
    return { m_cur, e_cur, wave };
}

function getMultipliers(side, type) {
    let pools = {}, starBonus = 0;
    side.heroes.forEach((h, i) => {
        if (h.name === "None") return;
        const d = HEROES[h.name];
        starBonus += GROWTH_TEMPLATES[d.template][(h.star || 5) * 6 + (h.sub || 0)];
        const skills = i < 3 ? d.skills : [d.skills[0]];
        skills.forEach((s, si) => {
            if (s.group !== type) return;
            const x = s.values[h[`s${si+1}`]-1];
            const ev = (s.duration === 0 ? s.getChance(x) * s.getMagnitude(x) : (1 - Math.pow(1-s.getChance(x), s.duration)) * s.getMagnitude(x));
            s.ids.forEach((id, ii) => {
                const val = Array.isArray(ev) ? ev[ii] : ev;
                pools[id] = (pools[id] || 0) + val;
            });
        });
    });
    let m = 1.0; Object.values(pools).forEach(v => m *= (1 + v));
    return { inf: m, cav: m, arc: m, star: starBonus };
}

function isAlive(a) { return (a.inf + a.cav + a.arc) > 1; }
