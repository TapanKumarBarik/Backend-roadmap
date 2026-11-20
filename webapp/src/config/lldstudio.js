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
  },
  lruCache: {
    id: 'lruCache',
    name: 'LRU Cache Architecture',
    category: 'Data Structures & LLD',
    pattern: 'Composite + Doubly Linked List',
    description: 'Constant O(1) get and put cache with hash map pointer lookup and doubly linked list frequency eviction.',
    mode: 'class',
    classes: [
      {
        id: 'CacheNode',
        name: 'CacheNode',
        fields: ['+ key: str', '+ value: Any', '+ prev: Optional[CacheNode]', '+ next: Optional[CacheNode]'],
        methods: ['+ __init__(key: str, val: Any)'],
        x: 40,
        y: 40,
        w: 240,
        h: 110
      },
      {
        id: 'DoublyLinkedList',
        name: 'DoublyLinkedList',
        fields: ['- head: CacheNode', '- tail: CacheNode', '- size: int'],
        methods: ['+ addToHead(node: CacheNode)', '+ removeNode(node: CacheNode)', '+ moveToHead(node: CacheNode)', '+ removeTail(): CacheNode'],
        x: 320,
        y: 40,
        w: 260,
        h: 130
      },
      {
        id: 'LRUCache',
        name: 'LRUCache',
        fields: ['- capacity: int', '- lookup: dict[str, CacheNode]', '- list: DoublyLinkedList'],
        methods: ['+ get(key: str): Optional[Any]', '+ put(key: str, val: Any)', '+ size(): int'],
        x: 620,
        y: 40,
        w: 250,
        h: 120
      },
      {
        id: 'IEvictionPolicy',
        name: 'IEvictionPolicy',
        stereotype: 'interface',
        fields: [],
        methods: ['+ keyAccessed(key: str)', '+ evictKey(): str'],
        x: 320,
        y: 210,
        w: 240,
        h: 90
      },
      {
        id: 'LRUEvictionPolicy',
        name: 'LRUEvictionPolicy',
        implements: 'IEvictionPolicy',
        fields: ['- order: DoublyLinkedList'],
        methods: ['+ keyAccessed(key: str)', '+ evictKey(): str'],
        x: 620,
        y: 210,
        w: 240,
        h: 90
      }
    ],
    relationships: [
      { from: 'DoublyLinkedList', to: 'CacheNode', type: 'composition', label: 'links' },
      { from: 'LRUCache', to: 'DoublyLinkedList', type: 'composition', label: 'tracks' },
      { from: 'LRUCache', to: 'CacheNode', type: 'association', label: 'maps' },
      { from: 'LRUEvictionPolicy', to: 'IEvictionPolicy', type: 'implementation', label: 'implements' }
    ]
  },
  chess: {
    id: 'chess',
    name: 'Chess Game Engine',
    category: 'Game Design',
    pattern: 'Command Pattern + Polymorphism',
    description: 'Complete object-oriented chess model with polymorphic piece moves, turn enforcement, and reversible command history.',
    mode: 'class',
    classes: [
      {
        id: 'Piece',
        name: 'Piece',
        stereotype: 'abstract',
        fields: ['+ isWhite: bool', '+ isKilled: bool'],
        methods: ['+ canMove(board: Board, start: Spot, end: Spot): bool'],
        x: 40,
        y: 40,
        w: 260,
        h: 100
      },
      {
        id: 'King',
        name: 'King',
        parent: 'Piece',
        fields: ['- castlingDone: bool'],
        methods: ['+ canMove(board: Board, start: Spot, end: Spot): bool'],
        x: 40,
        y: 180,
        w: 200,
        h: 90
      },
      {
        id: 'Knight',
        name: 'Knight',
        parent: 'Piece',
        fields: [],
        methods: ['+ canMove(board: Board, start: Spot, end: Spot): bool'],
        x: 260,
        y: 180,
        w: 200,
        h: 80
      },
      {
        id: 'Spot',
        name: 'Spot',
        fields: ['+ x: int', '+ y: int', '+ piece: Optional[Piece]'],
        methods: ['+ isOccupied(): bool'],
        x: 340,
        y: 40,
        w: 200,
        h: 100
      },
      {
        id: 'Board',
        name: 'Board',
        fields: ['- boxes: list[list[Spot]]'],
        methods: ['+ getSpot(x: int, y: int): Spot', '+ resetBoard()'],
        x: 580,
        y: 40,
        w: 230,
        h: 100
      },
      {
        id: 'MoveCommand',
        name: 'MoveCommand',
        fields: ['+ player: Player', '+ start: Spot', '+ end: Spot', '+ capturedPiece: Optional[Piece]'],
        methods: ['+ execute(): bool', '+ undo(): void'],
        x: 580,
        y: 180,
        w: 250,
        h: 110
      }
    ],
    relationships: [
      { from: 'King', to: 'Piece', type: 'inheritance', label: 'extends' },
      { from: 'Knight', to: 'Piece', type: 'inheritance', label: 'extends' },
      { from: 'Spot', to: 'Piece', type: 'aggregation', label: 'holds' },
      { from: 'Board', to: 'Spot', type: 'composition', label: 'contains 64' },
      { from: 'MoveCommand', to: 'Board', type: 'association', label: 'modifies' }
    ]
  }
};
