import { Button } from '@skymanuals/ui';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white">
      <div className="flex flex-col items-center space-y-8 p-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            SkyManuals
          </h1>
          <p className="text-lg text-gray-600 max-w-md">
            Samla, organisera och hantera alla dina flygplatstillstånd och dokumentation på ett plats.
          </p>
        </div>
        
        <div className="flex flex-col space-y-4">
          <Button size="lg" className="px-8">
            Logga in med Microsoft
          </Button>
          <Button size="lg" variant="outline" className="px-8">
            Logga in med Auth0
          </Button>
          <Button size="lg" variant="outline" className="px-8">
            Logga in med Keycloak
          </Button>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            Välj din organisation nedan när du är inloggad
          </p>
          <div className="mt-4 bg-gray-100 rounded-lg p-6 max-w-sm">
            <p className="text-gray-500 italic">Organisationsväxlare kommer här...</p>
          </div>
        </div>
      </div>
    </main>
  );
}
