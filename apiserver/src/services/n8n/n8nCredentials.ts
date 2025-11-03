/**
 * Credential management for n8n workflows
 * Handles creating and updating HTTP Header Auth credentials
 */

export type RequestMethod = <T>(method: string, path: string, body?: unknown) => Promise<T>;

/**
 * Create or update an HTTP Header Auth credential in n8n
 * This stores the user token securely as a credential resource
 * @param request - The request method from N8nClient
 * @param credentialName - Unique name for the credential (typically strategy ID or user ID)
 * @param userToken - The JWT token to store
 * @returns The credential ID
 */
export async function createOrUpdateCredential(
  request: RequestMethod,
  credentialName: string,
  userToken: string
): Promise<string> {
  try {
    console.log(`🔐 Creating/updating n8n credential:`, { credentialName });

    // Try to get existing credential first
    let existingCredentialId: string | null = null;
    try {
      const credentials = await request<Array<{ id: string; name: string }>>("GET", "/credentials");
      const existing = credentials.find((c) => c.name === credentialName);
      if (existing) {
        existingCredentialId = existing.id;
        console.log(`📋 Found existing credential:`, {
          credentialId: existingCredentialId,
          credentialName,
        });
      }
    } catch (_error) {
      // Credential doesn't exist yet, will create new one
      console.log(`ℹ️ No existing credential found, creating new one`);
    }

    // HTTP Header Auth credential structure for n8n
    const credentialData = {
      name: credentialName,
      type: "httpHeaderAuth",
      data: {
        name: "Authorization",
        value: `Bearer ${userToken}`,
      },
    };

    if (existingCredentialId) {
      // Update existing credential
      const response = await request<{ id: string }>(
        "PUT",
        `/credentials/${existingCredentialId}`,
        credentialData
      );
      console.log(`✅ Updated n8n credential:`, {
        credentialId: response.id,
        credentialName,
      });
      return response.id;
    }
    // Create new credential
    const response = await request<{ id: string }>("POST", "/credentials", credentialData);
    console.log(`✅ Created n8n credential:`, {
      credentialId: response.id,
      credentialName,
    });
    return response.id;
  } catch (error) {
    console.error(`❌ Error creating/updating n8n credential:`, {
      credentialName,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(
      `Failed to create/update credential: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
