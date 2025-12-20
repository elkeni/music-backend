export const config = {
    runtime: 'nodejs'
};

export default async function handler(req, res) {
    res.status(200).json({
        ok: true,
        runtime: 'nodejs',
        hasMeili: !!process.env.MEILI_URL,
        hasDb: !!process.env.DATABASE_URL
    });
}
