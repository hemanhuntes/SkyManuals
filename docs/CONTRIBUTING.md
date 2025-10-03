# Bidrag till SkyManuals

Tack för att du överväger att bidra till SkyManuals! Denna guide hjälper dig att komma igång med utveckling och förstår processen för att bidra till projektet.

## Första Steg

### Förutsättningar
- Node.js 18+ och npm 9+
- Docker och Docker Compose
- Git

### Installation och Setup

1. **Klona repository**
   ```bash
   git clone https://github.com/organization/skymanuals.git
   cd skymanuals
   ```

2. **Installera dependencies**
   ```bash
   npm install
   ```

3. **Kopiera environment variables**
   ```bash
   cp env.template .env
   ```
   Redigera `.env` med dina specifika värden.

4. **Starta utvecklingsmiljö**
   ```bash
   docker-compose up -d
   npm run dev
   ```

5. **Verifiera installation**
   ```bash
   npm run smoke
   ```

Alla tjänster ska vara tillgängliga på:
- Web App: http://localhost:3000
- API: http://localhost:3001
- API Documentation: http://localhost:3001/api

## Git Workflow och Branch Strategy

### Branch Namngivning
Vi använder en branch-strategi baserad på ändringstyp:

```bash
# Nya funktioner
feature/web-add-dashboard
feature/api-user-management
feature/efb-offline-sync

# Bugfix
fix/web-login-redirect
fix/api-validation-error

# Chores och maintenance
chore/deps-update-dependencies
chore/config-update-eslint
```

### Commit Meddelanden

Vi kräver **Conventional Commits** för automatisk changelog-generering:

```bash
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Tillåtna typer:**
- `feat`: Ny funktion
- `fix`: Bug fix
- `docs`: Dokumentationsändringar
- `style`: Kodning (formatting, missing semi colons, etc)
- `refactor`: Kod refaktoring
- `perf`: Performance förbättringar
- `test`: Lägger till/ändrar tester
- `build`: Ändringar i build system eller externa dependencies
- `ci`: Ändringar i CI-konfigurationer
- `chore`: Maintenance tasks

**Exempel:**
```bash
feat(web): add dashboard analytics
fix(api): resolve login authentication bug
docs: update contributing guidelines
chore(deps): upgrade to next.js 14
```

## Pull Request Process

### Före Pull Request

1. **Uppdatera din branch**
   ```bash
   git checkout main
   git pull origin main
   git checkout your-feature-branch
   git rebase main
   ```

2. **Kör lokala checks**
   ```bash
   npm run lint
   npm run typecheck
   npm run test
   npm run build
   ```

3. **Skapa changeset för paketändringar**
   ```bash
   npm run changeset
   ```
   Detta för paket som kommer påverka andra workspace.

### PR Checklista

När du skapar en Pull Request, se till:

- [ ] Kod följer projektstandardar och är läst
- [ ] Relevanta tester är inkluderade/uppdaterade
- [ ] Dokumentationen är uppdaterad vid behov
- [ ] Commit meddelanden följer Conventional Commits
- [ ] Changeset skapad för paketändringar
- [ ] Alla checks går igenom i GitHub Actions
- [ ] PR titel följer semantic PR format: `[type](scope): description`

### Code Review Kriterier

**Måste ha:**
- Functionality fungerar som förväntat
- Kod är läsbar och välkommenterad
- Tester täcker ny funktionalitet (minst 80% coverage för kritisk kod)
- Inga säkerhetsrisk för introduktions
- Aviation compliance valideted för relevanta ändringar

**Bör ha:**
- Prestanda optimeringar där relevant
- Dokumentation för komplex logik
- Edge cases hanterade
- Load testing för API-endpoints med >100 req/s

### Merge Process

1. **Semantic Pull Request Check**: Automatisk validering av PR titel
2. **Required Reviews**: CodeOwners måste godkänna
3. **CI Checks**: Alla tests och builds måste passera
4. **Changeset Validation**: Förändringsverifiering för paket

## Lokal Utveckling

### Kör Individual Services

```bash
# Web app only
npm run dev --workspace=apps/web

# API only 
npm run dev --workspace=apps/api

# EFB app
npm run dev --workspace=apps/efb

# All services
npm run dev
```

### Databas Kommandos

```bash
# Reset databas
docker-compose down
docker-compose up -d postgres
npm run db:push --workspace=apps/api

# Generera Prisma klient
npm run db:generate --workspace=apps/api

# Öppna Prisma Studio
npm run db:studio --workspace=apps/api
```

### Testing Strategies & Coverage Requirements

**Unit Tests:** Måste ha >= 80% coverage för kritisk kod
```bash
npm run test --workspace=apps/web
npm run test --workspace=apps/api
npm run test:coverage  # Visar coverage report
```

**Integration Tests:** Med databas och Redis
```bash
docker-compose up -d postgres redis
npm run test:integration
```

**E2E Tests:**
```bash
npm run smoke        # Smoke tests för grundfunktionalitet
npm run test:e2e     # Playwright e2e tests
```

**Load Testing:** För API performance validation
```bash
npm run test:load     # k6 load tests för /api/* endpoints
```

**Security Testing:** 
```bash
npm run test:security # snyk vuln scan + npm audit
npm audit --audit-level=high
```

**Aviation-Specific Testing:**
- EFB offline simulation (airplane mode scenarios)
- Document sync conflict resolution testing
- Regulatory compliance validation tests

## Paketversionering och Releases

### Changesets

När du ändrar kod som påverkar andra paket:

```bash
npm run changeset
```

Detta öppnar en interaktiv CLI för att:
- Välj vilka paket som har ändrats
- Sammanfatta ändringen för changelog
- Välj version bump (major/minor/patch)
- Specificera om ändringen kräver migrations eller konfigurationsändringar

### Release Process

Automaterad genom GitHub Actions:
1. **Merge till main** täcker changesets
2. **Auto-versioning** baserat på changesets
3. **Auto-publishing** till npm registry
4. **GitHub Release** med changelog
5. **Docker images** är taggade och pushat

## Troubleshooting

### Vanliga Problem

**Node_modules conflicts:**
```bash
rm -rf node_modules package-lock.json
npm install
```

**Database connection issues:**
```bash
docker-compose down postgres
docker-compose up -d postgres
```

**Build failures:**
```bash
npm run clean
npm install
npm run build
```

**TypeScript errors:**
```bash
npm run typecheck
```

**Aviation-specific troubleshooting:**

**EFB Sync issues:**
```bash
# Clear EFB cache och reinitiate sync
npm run dev --workspace=apps/efb -- --reset-cache
```

**Compliance validation errors:**
```bash
# Regenerate audit logs och validate integrity
npm run db:seed --workspace=apps/api
npm run test:compliance
```

**Performance issues:**
```bash
# Run load tests för diagnostik
npm run test:load -- --threshold p95=1500ms
```

### Få Hjälp

- **Issues**: Skapa GitHub issue för buggar eller feature requests
- **Discussions**: Använd GitHub Discussions för frågor
- **Code Review**: Fråga specifika frågor i PR reviews

## Code of Conduct

Alla bidragare måste följa vår [Code of Conduct](./CODE_OF_CONDUCT.md). Tacksam för att hjälpa till att skapa en välkommande och inkluderande miljö!

## Lisens

Genom att bidra till detta projekt från du att din kod kommer att vara licensierad under projektets [MIT License](./LICENSE).

---

**Tack för ditt bidrag till SkyManuals! 🚀**
