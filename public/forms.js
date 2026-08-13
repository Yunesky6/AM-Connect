// ---------------------------------------------------------------------------
// FORMS REGISTRY
//
// This is where every form in the app is defined. To add a new form later,
// copy the shape below and push a new object into FORMS — the app renders
// forms from this data, so no other file needs to change.
//
// Field types available:
//   text       { type:'text', name, label, required, placeholder }
//   number     { type:'number', name, label, step, required }
//   date       { type:'date', name, label, required }
//   textarea   { type:'textarea', name, label, placeholder }
//   select     { type:'select', name, label, options: ['A','B',...] }
//   checkgroup { type:'checkgroup', name, items: ['Item 1','Item 2',...] }
//                 -> renders a Pass/Fail/N-A row per item
//   signature  { type:'signature', name, label }
//   photo      { type:'photo', name, label }
//                 -> "Add Photo" button opens the device camera (or a file
//                    picker on desktop); supports multiple photos, shown as
//                    a thumbnail grid with per-photo remove, and embedded
//                    into the generated PDF automatically
//   row        { type:'row', fields: [ ...two or more of the above... ] }
//                 -> lays fields out side by side
//
// Each form = { id, title, subtitle, icon, sections: [ { heading, group, fields: [...] }, ... ] }
//
// `group` is optional. Consecutive sections sharing the same group string get
// a colored group-header bar in the generated PDF (matching a paper form's
// major category dividers, e.g. "Cooling System Startup" vs "Electric Heat
// Operation") — it has no effect on the in-app form itself.
// ---------------------------------------------------------------------------

const FORMS = [
  {
    id: 'hvac-checklist',
    title: 'HVAC Inspection Checklist',
    subtitle: 'Preventive maintenance & inspection',
    icon: '❄', // snowflake
    sections: [
      {
        heading: 'Job Info',
        fields: [
          { type: 'text', name: 'projectName', label: 'Project / Job Name', required: true },
          { type: 'row', fields: [
            { type: 'text', name: 'techName', label: 'Technician Name', required: true },
            { type: 'date', name: 'date', label: 'Date', required: true }
          ]},
          { type: 'text', name: 'site', label: 'Site / Location' },
          { type: 'text', name: 'unitId', label: 'Unit ID / Equipment Tag' }
        ]
      },
      {
        heading: 'Equipment Info',
        fields: [
          { type: 'row', fields: [
            { type: 'select', name: 'equipType', label: 'Equipment Type', options: ['Rooftop Unit (RTU)', 'Split System AC', 'Heat Pump', 'Furnace', 'Chiller', 'Other'] },
            { type: 'text', name: 'make', label: 'Make' }
          ]},
          { type: 'row', fields: [
            { type: 'text', name: 'model', label: 'Model' },
            { type: 'text', name: 'serial', label: 'Serial Number' }
          ]}
        ]
      },
      {
        heading: 'Visual & Mechanical',
        fields: [
          { type: 'checkgroup', name: 'visual', items: [
            'Condensate drain clear',
            'Belts condition OK',
            'Bearings lubricated',
            'Evaporator coil clean',
            'Condenser coil clean',
            'Filters clean / replaced',
            'Cabinet & housing condition OK'
          ]}
        ]
      },
      {
        heading: 'Electrical',
        fields: [
          { type: 'row', fields: [
            { type: 'number', name: 'voltage', label: 'Voltage (V)', step: '0.1' },
            { type: 'number', name: 'amperage', label: 'Amperage (A)', step: '0.1' }
          ]},
          { type: 'checkgroup', name: 'electrical', items: [
            'Contactors condition OK',
            'Wiring condition OK',
            'Capacitors tested OK'
          ]}
        ]
      },
      {
        heading: 'Refrigerant / Charge',
        fields: [
          { type: 'text', name: 'refrigType', label: 'Refrigerant Type', placeholder: 'e.g. R-410A' },
          { type: 'row', fields: [
            { type: 'number', name: 'suctionPsi', label: 'Suction Pressure (psi)', step: '0.1' },
            { type: 'number', name: 'headPsi', label: 'Head Pressure (psi)', step: '0.1' }
          ]},
          { type: 'row', fields: [
            { type: 'number', name: 'superheat', label: 'Superheat (°F)', step: '0.1' },
            { type: 'number', name: 'subcooling', label: 'Subcooling (°F)', step: '0.1' }
          ]}
        ]
      },
      {
        heading: 'Airflow',
        fields: [
          { type: 'row', fields: [
            { type: 'number', name: 'supplyTemp', label: 'Supply Temp (°F)', step: '0.1' },
            { type: 'number', name: 'returnTemp', label: 'Return Temp (°F)', step: '0.1' }
          ]},
          { type: 'number', name: 'staticPressure', label: 'Static Pressure (in. w.c.)', step: '0.01' }
        ]
      },
      {
        heading: 'Safety Controls',
        fields: [
          { type: 'checkgroup', name: 'safety', items: [
            'Safety switches tested',
            'Thermostat operation verified',
            'Emergency shutoffs functional'
          ]}
        ]
      },
      {
        heading: 'Notes / Deficiencies',
        fields: [
          { type: 'textarea', name: 'notes', label: '', placeholder: 'Describe any issues found or parts needed' }
        ]
      },
      {
        heading: 'Technician Signature',
        fields: [
          { type: 'signature', name: 'signature' }
        ]
      }
    ]
  },

  {
    id: 'wshp-startup',
    title: 'WSHP Startup Checklist',
    subtitle: 'Water Source Heat Pump — cooling & electric heat startup',
    icon: '💧',
    sections: [
      {
        heading: 'Job Info',
        fields: [
          { type: 'text', name: 'projectName', label: 'Project / Job Name', required: true },
          { type: 'row', fields: [
            { type: 'text', name: 'unitTag', label: 'Unit Tag / Apartment', required: true },
            { type: 'text', name: 'thermostatTTO', label: 'Thermostat (TTO) #' }
          ]},
          { type: 'row', fields: [
            { type: 'text', name: 'model', label: 'Model #' },
            { type: 'text', name: 'serial', label: 'Serial #' }
          ]}
        ]
      },
      {
        heading: 'Cooling — Pre-Startup',
        group: 'Cooling System Startup',
        fields: [
          { type: 'checkgroup', name: 'preStartup', items: [
            'Unit installed level and secured',
            'Electrical connections tight',
            'Correct unit model, voltage, and electric heat kW verified',
            'Control board (CXM / DXM / AXB) visually inspected',
            'Heat pump heating disabled in controls (DIP switches)',
            'Filter clean and properly installed',
            'Condensate drain connected and trapped',
            'Access panels installed'
          ]}
        ]
      },
      {
        heading: 'Water Loop (Cooling Only)',
        group: 'Cooling System Startup',
        fields: [
          { type: 'checkgroup', name: 'waterLoop', items: [
            'Supply and return valves open',
            'System flushed and clean',
            'Air purged from loop',
            'Proper water flow confirmed',
            'No visible leaks at hose kits or coax connections',
            'Entering water temperature (EWT) within cooling design range 60–90°F'
          ]}
        ]
      },
      {
        heading: 'Electrical',
        group: 'Cooling System Startup',
        fields: [
          { type: 'checkgroup', name: 'electrical', items: [
            'Main power ON',
            'Correct line voltage at unit',
            'Fuses/breakers sized per nameplate',
            'Control transformer output verified',
            'Electric heater power supply verified'
          ]}
        ]
      },
      {
        heading: 'Startup & Operation — Cooling',
        group: 'Cooling System Startup',
        fields: [
          { type: 'checkgroup', name: 'coolingStartup', items: [
            'Thermostat calling for cooling',
            'Blower starts correctly',
            'Compressor starts and runs normally',
            'No fault codes or flashing LEDs on control board',
            'No abnormal noise or vibration'
          ]}
        ]
      },
      {
        heading: 'Air Distribution',
        group: 'Cooling System Startup',
        fields: [
          { type: 'checkgroup', name: 'airDistribution', items: [
            'Airflow present at all supply grilles',
            'No blocked or closed grilles',
            'No unusual noise at grilles or diffusers',
            'Return air path unobstructed'
          ]}
        ]
      },
      {
        heading: 'Performance Check — Cooling',
        group: 'Cooling System Startup',
        fields: [
          { type: 'row', fields: [
            { type: 'number', name: 'coolingReturnAirTemp', label: 'Return Air Temp (°F)', step: '0.1' },
            { type: 'number', name: 'coolingSupplyAirTemp', label: 'Supply Air Temp (°F)', step: '0.1' }
          ]},
          { type: 'row', fields: [
            { type: 'number', name: 'ewt', label: 'Entering Water Temp — EWT (°F)', step: '0.1' },
            { type: 'number', name: 'lwt', label: 'Leaving Water Temp — LWT (°F)', step: '0.1' }
          ]},
          { type: 'checkgroup', name: 'coolingPerformance', items: [
            'Air temp drop within expected range (15–25°F)',
            'Water temp rise within expected range (7–12°F)',
            'Compressor amp draw within nameplate ratings'
          ]}
        ]
      },
      {
        heading: 'Startup & Operation — Electric Heat',
        group: 'Electric Heat Operation',
        fields: [
          { type: 'checkgroup', name: 'heatStartup', items: [
            'Thermostat calling for heat',
            'Blower operates with heater',
            'Compressor remains OFF',
            'Electric heater stages energize properly',
            'No fault codes or lockouts'
          ]}
        ]
      },
      {
        heading: 'Performance Check — Electric Heat',
        group: 'Electric Heat Operation',
        fields: [
          { type: 'row', fields: [
            { type: 'number', name: 'heatReturnAirTemp', label: 'Return Air Temp (°F)', step: '0.1' },
            { type: 'number', name: 'heatSupplyAirTemp', label: 'Supply Air Temp (°F)', step: '0.1' }
          ]},
          { type: 'checkgroup', name: 'heatPerformance', items: [
            'Air temp rise within expected range (25–45°F, based on heater kW)',
            'Heater amp draw within nameplate ratings',
            'No abnormal odor after initial warm-up'
          ]}
        ]
      },
      {
        heading: 'Electric Heat Safeties',
        group: 'Electric Heat Operation',
        fields: [
          { type: 'checkgroup', name: 'heatSafeties', items: [
            'High-limit protection verified',
            'Heater contactors operate correctly',
            'Heater cycles off normally'
          ]}
        ]
      },
      {
        heading: 'Final',
        group: 'Electric Heat Operation',
        fields: [
          { type: 'checkgroup', name: 'final', items: [
            'Unit switches correctly between cooling and electric heat',
            'No active or stored fault codes',
            'Panels secured',
            'Area cleaned',
            'Startup data logged'
          ]}
        ]
      },
      {
        heading: 'Notes',
        fields: [
          { type: 'textarea', name: 'notes', label: '', placeholder: 'Additional notes' },
          { type: 'row', fields: [
            { type: 'text', name: 'completedBy', label: 'Startup Completed By', required: true },
            { type: 'date', name: 'date', label: 'Date', required: true }
          ]}
        ]
      },
      {
        heading: 'Signature',
        fields: [
          { type: 'signature', name: 'signature' }
        ]
      }
    ]
  }
];
