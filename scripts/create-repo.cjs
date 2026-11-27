/* Generate Homebrew Channel metadata from the exact IPK being released. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function createRepo(app, ipk, repository, tag, branch) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
        throw new Error("Expected a GitHub owner/repository");
    }
    if (tag !== `v${app.version}`) {
        throw new Error(`Release tag must be v${app.version}`);
    }
    const filename = `${app.id}_${app.version}_all.ipk`;
    if (path.basename(ipk) !== filename) {
        throw new Error(`Expected package ${filename}`);
    }
    const bytes = fs.readFileSync(ipk);
    const sourceUrl = `https://github.com/${repository}`;
    const iconUri = `https://raw.githubusercontent.com/${repository}/${encodeURIComponent(branch)}/app/${app.largeIcon}`;
    return {
        packages: [
            {
                id: app.id,
                title: app.title,
                shortDescription: "Bekijk snel het laatste journaal",
                iconUri,
                manifest: {
                    id: app.id,
                    version: app.version,
                    type: app.type,
                    title: app.title,
                    iconUri,
                    sourceUrl,
                    rootRequired: false,
                    ipkUrl: `${sourceUrl}/releases/download/${tag}/${filename}`,
                    ipkHash: {
                        sha256: crypto
                            .createHash("sha256")
                            .update(bytes)
                            .digest("hex"),
                    },
                    ipkSize: bytes.length,
                },
            },
        ],
    };
}

if (require.main === module) {
    const [ipk, repository, tag, branch = "main", output = "repo.json"] =
        process.argv.slice(2);
    const app = require("../app/appinfo.json");
    fs.writeFileSync(
        output,
        JSON.stringify(createRepo(app, ipk, repository, tag, branch), null, 2) +
            "\n",
    );
}

module.exports = { createRepo };
