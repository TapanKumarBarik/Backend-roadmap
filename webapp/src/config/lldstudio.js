// Presets and definitions for the LLD & Database Schema Studio (/tools/lld-studio/).
// Contains classic Low-Level Design interview problems, GoF patterns, and relational ER schemas.

export const LLD_PRESETS = {
  parkingLot: {
    id: 'parkingLot',
    name: 'Parking Lot System',
    category: 'Object-Oriented Design',
    pattern: 'Strategy + Factory + Inheritance',
    description: 'Multi-floor parking lot with vehicle-specific spot allocation and pluggable fee calculation strategies.',
    mode: 'class',
    classes: [
      {
        id: 'Vehicle',
        name: 'Vehicle',
        stereotype: 'abstract',
        fields: ['+ licensePlate: str', '+ spotType: SpotType'],
        methods: ['+ getLicensePlate(): str', '+ getSpotType(): SpotType'],
        x: 40,
        y: 40,
        w: 220,
        h: 120
      },
      {
        id: 'Car',
        name: 'Car',
        parent: 'Vehicle',
        fields: ['- hasChildSeat: bool'],
        methods: ['+ __init__(licensePlate: str)'],
        x: 40,
        y: 200,
        w: 200,
        h: 90
      },
      {
        id: 'Motorcycle',
        name: 'Motorcycle',
        parent: 'Vehicle',
        fields: ['- helmetCount: int'],
        methods: ['+ __init__(licensePlate: str)'],
        x: 260,
        y: 200,
        w: 200,
        h: 90
      },
      {
        id: 'ParkingSpot',
        name: 'ParkingSpot',
        fields: ['+ spotId: int', '+ floor: int', '+ isOccupied: bool', '+ vehicle: Optional[Vehicle]'],
        methods: ['+ park(vehicle: Vehicle): bool', '+ vacate(): Optional[Vehicle]'],
        x: 320,
        y: 40,
        w: 230,
        h: 130
      },
      {
        id: 'ParkingTicket',
        name: 'ParkingTicket',
        fields: ['+ ticketId: str', '+ entryTime: datetime', '+ exitTime: Optional[datetime]', '+ spotId: int'],
        methods: ['+ calculateDurationMinutes(): int'],
        x: 600,
        y: 40,
        w: 240,
        h: 120
      },
      {
        id: 'IPricingStrategy',
        name: 'IPricingStrategy',
        stereotype: 'interface',
        fields: [],
        methods: ['+ calculateFee(ticket: ParkingTicket): float'],
        x: 600,
        y: 200,
        w: 240,
        h: 90
      },
      {
        id: 'HourlyPricing',
        name: 'HourlyPricing',
        implements: 'IPricingStrategy',
        fields: ['- hourlyRate: float'],
        methods: ['+ calculateFee(ticket: ParkingTicket): float'],
        x: 500,
        y: 330,
        w: 220,
        h: 90
      },
      {
        id: 'FlatRatePricing',
        name: 'FlatRatePricing',
        implements: 'IPricingStrategy',
        fields: ['- flatFee: float'],
        methods: ['+ calculateFee(ticket: ParkingTicket): float'],
        x: 740,
        y: 330,
        w: 220,
        h: 90
      }
    ],
    relationships: [
      { from: 'Car', to: 'Vehicle', type: 'inheritance', label: 'extends' },
      { from: 'Motorcycle', to: 'Vehicle', type: 'inheritance', label: 'extends' },
      { from: 'ParkingSpot', to: 'Vehicle', type: 'aggregation', label: 'holds' },
      { from: 'HourlyPricing', to: 'IPricingStrategy', type: 'implementation', label: 'implements' },
      { from: 'FlatRatePricing', to: 'IPricingStrategy', type: 'implementation', label: 'implements' },
      { from: 'IPricingStrategy', to: 'ParkingTicket', type: 'association', label: 'evaluates' }
    ]
  },
  elevator: {
    id: 'elevator',
    name: 'Elevator System',
    category: 'Design Patterns',
    pattern: 'State Pattern + Observer',
    description: 'Elevator controller handling floor dispatching, request queues, and car motion states (Idle, MovingUp, MovingDown, DoorsOpen).',
    mode: 'class',
    classes: [
      {
        id: 'ElevatorCar',
        name: 'ElevatorCar',
        fields: ['+ carId: int', '+ currentFloor: int', '+ state: IElevatorState', '+ targetFloors: list[int]'],
        methods: ['+ setState(state: IElevatorState)', '+ moveToFloor(floor: int)', '+ step()'],
        x: 40,
        y: 40,
        w: 250,
        h: 140
      },
      {
        id: 'IElevatorState',
        name: 'IElevatorState',
        stereotype: 'interface',
        fields: [],
        methods: ['+ onEnterFloor(car: ElevatorCar)', '+ onDoorTimeout(car: ElevatorCar)'],
        x: 360,
        y: 40,
        w: 250,
        h: 100
      },
      {
        id: 'IdleState',
        name: 'IdleState',
        implements: 'IElevatorState',
        fields: [],
        methods: ['+ onEnterFloor(car: ElevatorCar)', '+ onDoorTimeout(car: ElevatorCar)'],
        x: 320,
        y: 190,
        w: 200,
        h: 90
      },
      {
        id: 'MovingState',
        name: 'MovingState',
        implements: 'IElevatorState',
        fields: ['+ direction: Direction'],
        methods: ['+ onEnterFloor(car: ElevatorCar)', '+ onDoorTimeout(car: ElevatorCar)'],
        x: 540,
        y: 190,
        w: 200,
        h: 90
      },
      {
        id: 'DoorsOpenState',
        name: 'DoorsOpenState',
        implements: 'IElevatorState',
        fields: ['- openSeconds: int'],
        methods: ['+ onEnterFloor(car: ElevatorCar)', '+ onDoorTimeout(car: ElevatorCar)'],
        x: 760,
        y: 190,
        w: 200,
        h: 90
      },
      {
        id: 'Dispatcher',
        name: 'Dispatcher',
        fields: ['- cars: list[ElevatorCar]', '- pendingRequests: queue'],
        methods: ['+ requestPickup(floor: int, direction: Direction)', '+ schedule()'],
        x: 40,
        y: 230,
        w: 250,
        h: 120
      }
    ],
    relationships: [
      { from: 'ElevatorCar', to: 'IElevatorState', type: 'aggregation', label: 'current state' },
      { from: 'IdleState', to: 'IElevatorState', type: 'implementation', label: 'implements' },
      { from: 'MovingState', to: 'IElevatorState', type: 'implementation', label: 'implements' },
      { from: 'DoorsOpenState', to: 'IElevatorState', type: 'implementation', label: 'implements' },
      { from: 'Dispatcher', to: 'ElevatorCar', type: 'association', label: 'manages' }
    ]
  },
  paymentGateway: {
    id: 'paymentGateway',
    name: 'Payment & Checkout Engine',
    category: 'Enterprise Backend',
    pattern: 'Strategy + Factory + Decorator',
    description: 'Decoupled checkout processing system with polymorphic gateways, retry decorators, and immutable audit logs.',
    mode: 'class',
    classes: [
      {
        id: 'Order',
        name: 'Order',
        fields: ['+ orderId: str', '+ customerId: str', '+ totalAmount: Decimal', '+ status: OrderStatus'],
        methods: ['+ markPaid()', '+ markFailed(reason: str)'],
        x: 40,
        y: 40,
        w: 240,
        h: 120
      },
      {
        id: 'IPaymentGateway',
        name: 'IPaymentGateway',
        stereotype: 'interface',
        fields: [],
        methods: ['+ charge(order: Order, token: str): TransactionResult', '+ refund(txId: str): bool'],
        x: 340,
        y: 40,
        w: 280,
        h: 100
      },
      {
        id: 'StripeGateway',
        name: 'StripeGateway',
        implements: 'IPaymentGateway',
        fields: ['- apiKey: str'],
        methods: ['+ charge(order: Order, token: str): TransactionResult', '+ refund(txId: str): bool'],
        x: 200,
        y: 190,
        w: 250,
        h: 90
      },
      {
        id: 'PayPalGateway',
        name: 'PayPalGateway',
        implements: 'IPaymentGateway',
        fields: ['- clientId: str', '- secret: str'],
        methods: ['+ charge(order: Order, token: str): TransactionResult', '+ refund(txId: str): bool'],
        x: 480,
        y: 190,
        w: 250,
        h: 90
      },
      {
        id: 'RetryGatewayDecorator',
        name: 'RetryGatewayDecorator',
        implements: 'IPaymentGateway',
        fields: ['- wrapped: IPaymentGateway', '- maxAttempts: int'],
        methods: ['+ charge(order: Order, token: str): TransactionResult'],
        x: 750,
        y: 190,
        w: 240,
        h: 110
      },
      {
        id: 'PaymentFactory',
        name: 'PaymentFactory',
        fields: [],
        methods: ['+ create(provider: str): IPaymentGateway'],
        x: 40,
        y: 200,
        w: 240,
        h: 90
      }
    ],
    relationships: [
      { from: 'StripeGateway', to: 'IPaymentGateway', type: 'implementation', label: 'implements' },
      { from: 'PayPalGateway', to: 'IPaymentGateway', type: 'implementation', label: 'implements' },
      { from: 'RetryGatewayDecorator', to: 'IPaymentGateway', type: 'implementation', label: 'decorates' },
      { from: 'PaymentFactory', to: 'IPaymentGateway', type: 'association', label: 'instantiates' },
      { from: 'IPaymentGateway', to: 'Order', type: 'association', label: 'processes' }
    ]
  },
  socialEr: {
    id: 'socialEr',
    name: 'Social Network Schema (ER)',
    category: 'Database Design',
    pattern: 'Relational 3NF with Junctions',
    description: 'PostgreSQL production schema featuring users, posts, tagging taxonomy, and bi-directional follower graphs.',
    mode: 'er',
    entities: [
      {
        id: 'users',
        name: 'users',
        fields: [
          { name: 'id', type: 'BIGSERIAL', isPk: true },
          { name: 'username', type: 'VARCHAR(50)', isUnique: true },
          { name: 'email', type: 'VARCHAR(255)', isUnique: true },
          { name: 'created_at', type: 'TIMESTAMPTZ' }
        ],
        x: 40,
        y: 40,
        w: 220,
        h: 140
      },
      {
        id: 'posts',
        name: 'posts',
        fields: [
          { name: 'id', type: 'BIGSERIAL', isPk: true },
          { name: 'author_id', type: 'BIGINT', isFk: true, ref: 'users.id' },
          { name: 'title', type: 'VARCHAR(200)' },
          { name: 'content', type: 'TEXT' },
          { name: 'created_at', type: 'TIMESTAMPTZ' }
        ],
        x: 320,
        y: 40,
        w: 230,
        h: 160
      },
      {
        id: 'comments',
        name: 'comments',
        fields: [
          { name: 'id', type: 'BIGSERIAL', isPk: true },
          { name: 'post_id', type: 'BIGINT', isFk: true, ref: 'posts.id' },
          { name: 'author_id', type: 'BIGINT', isFk: true, ref: 'users.id' },
          { name: 'body', type: 'TEXT' },
          { name: 'created_at', type: 'TIMESTAMPTZ' }
        ],
        x: 610,
        y: 40,
        w: 230,
        h: 160
      },
      {
        id: 'follows',
        name: 'follows',
        fields: [
          { name: 'follower_id', type: 'BIGINT', isPk: true, isFk: true, ref: 'users.id' },
          { name: 'followed_id', type: 'BIGINT', isPk: true, isFk: true, ref: 'users.id' },
          { name: 'created_at', type: 'TIMESTAMPTZ' }
        ],
        x: 40,
        y: 240,
        w: 220,
        h: 120
      },
      {
        id: 'tags',
        name: 'tags',
        fields: [
          { name: 'id', type: 'SERIAL', isPk: true },
          { name: 'slug', type: 'VARCHAR(50)', isUnique: true }
        ],
        x: 320,
        y: 250,
        w: 200,
        h: 100
      },
      {
        id: 'post_tags',
        name: 'post_tags',
        fields: [
          { name: 'post_id', type: 'BIGINT', isPk: true, isFk: true, ref: 'posts.id' },
          { name: 'tag_id', type: 'INT', isPk: true, isFk: true, ref: 'tags.id' }
        ],
        x: 580,
        y: 250,
        w: 210,
        h: 100
      }
    ],
    relationships: [
      { from: 'users', to: 'posts', type: 'oneToMany', label: '1 : N' },
      { from: 'posts', to: 'comments', type: 'oneToMany', label: '1 : N' },
      { from: 'users', to: 'comments', type: 'oneToMany', label: '1 : N' },
      { from: 'users', to: 'follows', type: 'oneToMany', label: '1 : N' },
      { from: 'posts', to: 'post_tags', type: 'oneToMany', label: '1 : N' },
      { from: 'tags', to: 'post_tags', type: 'oneToMany', label: '1 : N' }
    ]
  }
};
