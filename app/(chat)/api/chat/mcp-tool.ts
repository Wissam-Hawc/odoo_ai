export function fetchMcpTool({ url }: { url: string }) {
    return {
      name: 'odoo_mcp',
      description: 'Fetch data from an Odoo instance via MCP',
      execute: async ({ query }: { query: string }) => {
        console.log('Executing MCP tool with query:', query);
        try {
          const response = await fetch(`${url}/mcp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
          });
          if (!response.ok) {
            console.error('MCP request failed with status:', response.status);
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const data = await response.json();
          console.log('MCP tool response:', data);
          return data;
        } catch (error) {
          console.error('Error fetching from MCP:', error);
          throw error;
        }
      },
    };
  }